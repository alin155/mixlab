use anyhow::{anyhow, Context, Result};
use axum::{
    extract::{Path as AxumPath, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    env, fs,
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::{Arc, RwLock},
    thread,
    time::{Instant, SystemTime, UNIX_EPOCH},
};
use tantivy::{
    collector::TopDocs,
    doc,
    query::{BooleanQuery, Query as TantivyQuery, TermQuery},
    schema::{Field, IndexRecordOption, Schema, Value, STORED, TEXT},
    Index, IndexReader, TantivyDocument, Term,
};
use unicode_general_category::{get_general_category, GeneralCategory};

const DEFAULT_HOST: &str = "127.0.0.1";
const DEFAULT_PORT: u16 = 3799;
const CURSOR_PREFIX: &str = "searchd:";
const SEARCH_CACHE_SCHEMA_VERSION: &str = "1.1";
const MAX_TANTIVY_DOCS: usize = 20_000;
const MIN_TANTIVY_CANDIDATE_DOCS: usize = 400;
const MAX_CANDIDATE_EVALUATION_WINDOW: usize = 400;
const CANDIDATE_EVALUATION_MULTIPLIER: usize = 8;
const SHORT_QUERY_CANDIDATE_EVALUATION_MULTIPLIER: usize = 2;
const MAX_SHORT_QUERY_CANDIDATE_EVALUATION_WINDOW: usize = 80;
const MAX_SUPPLEMENTAL_ANCHOR_CANDIDATES: usize = 8;
const SUPPLEMENTAL_RECALL_MIN_QUERY_LENGTH: usize = 8;
const LONG_QUERY_ANCHOR_THRESHOLD: usize = 80;
const LONG_QUERY_MIN_ANCHOR_LENGTH: usize = 14;
const LONG_QUERY_MAX_ANCHOR_LENGTH: usize = 32;
const LONG_QUERY_MAX_ANCHORS: usize = 8;
const LONG_QUERY_MIN_GROUPED_ANCHORS: usize = 2;

#[derive(Debug, Clone)]
struct SearchdConfig {
    library_root: PathBuf,
    cache_root: Option<PathBuf>,
    host: String,
    port: u16,
}

impl SearchdConfig {
    fn from_env_and_args() -> Result<Self> {
        let mut library_root = optional_env("MIXLAB_SEARCHD_LIBRARY_ROOT")
            .or_else(|| optional_env("MIXLAB_CUTTER_LIBRARY_ROOT"))
            .or_else(|| optional_env("MIXLAB_PREPROCESS_LIBRARY_ROOT"))
            .map(PathBuf::from);
        let mut cache_root = optional_env("MIXLAB_SEARCHD_CACHE_ROOT").map(PathBuf::from);
        let mut host =
            optional_env("MIXLAB_SEARCHD_HOST").unwrap_or_else(|| DEFAULT_HOST.to_string());
        let mut port = optional_env("MIXLAB_SEARCHD_PORT")
            .as_deref()
            .map(parse_port)
            .transpose()?
            .unwrap_or(DEFAULT_PORT);

        let args = env::args().skip(1).collect::<Vec<_>>();
        let mut index = 0;
        while index < args.len() {
            match args[index].as_str() {
                "--library-root" => {
                    index += 1;
                    let value = args
                        .get(index)
                        .ok_or_else(|| anyhow!("--library-root requires a value"))?;
                    library_root = Some(PathBuf::from(value));
                }
                "--host" => {
                    index += 1;
                    host = args
                        .get(index)
                        .ok_or_else(|| anyhow!("--host requires a value"))?
                        .to_string();
                }
                "--cache-root" => {
                    index += 1;
                    let value = args
                        .get(index)
                        .ok_or_else(|| anyhow!("--cache-root requires a value"))?;
                    cache_root = Some(PathBuf::from(value));
                }
                "--port" => {
                    index += 1;
                    port = parse_port(
                        args.get(index)
                            .ok_or_else(|| anyhow!("--port requires a value"))?,
                    )?;
                }
                "--help" | "-h" => {
                    print_help();
                    std::process::exit(0);
                }
                unknown => return Err(anyhow!("unknown argument: {unknown}")),
            }
            index += 1;
        }

        let library_root = library_root.ok_or_else(|| {
            anyhow!(
                "library root is required; set MIXLAB_SEARCHD_LIBRARY_ROOT or pass --library-root"
            )
        })?;

        Ok(Self {
            library_root,
            cache_root,
            host,
            port,
        })
    }
}

fn optional_env(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn parse_port(value: &str) -> Result<u16> {
    let port = value
        .parse::<u16>()
        .with_context(|| format!("invalid port: {value}"))?;
    if port == 0 {
        return Err(anyhow!("port must be between 1 and 65535"));
    }
    Ok(port)
}

fn print_help() {
    println!(
        "mixlab-searchd --library-root <path> [--host 127.0.0.1] [--port 3799]\n\
         Optional: --cache-root <local-path>\n\
         Env: MIXLAB_SEARCHD_LIBRARY_ROOT, MIXLAB_SEARCHD_CACHE_ROOT, MIXLAB_SEARCHD_HOST, MIXLAB_SEARCHD_PORT"
    );
}

#[derive(Debug, Deserialize)]
struct SearchQuery {
    query: String,
    limit: Option<usize>,
    cursor: Option<String>,
}

#[derive(Debug, Serialize)]
struct ApiEnvelope<T: Serialize> {
    schema_version: &'static str,
    data: T,
}

#[derive(Debug, Serialize)]
struct ApiErrorBody {
    error: ApiErrorDetail,
}

#[derive(Debug, Serialize)]
struct ApiErrorDetail {
    code: &'static str,
    message: String,
}

#[derive(Debug)]
struct ApiError {
    status: StatusCode,
    code: &'static str,
    message: String,
}

impl ApiError {
    fn bad_request(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            code,
            message: message.into(),
        }
    }

    fn internal(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code: "searchd_internal_error",
            message: message.into(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(ApiErrorBody {
                error: ApiErrorDetail {
                    code: self.code,
                    message: self.message,
                },
            }),
        )
            .into_response()
    }
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    ok: bool,
    library_root: String,
    cache_root: String,
    index_version: String,
    source_video_count: usize,
    segment_count: usize,
}

#[derive(Debug, Serialize)]
struct SearchResponse {
    query: String,
    normalized_query: String,
    cursor: String,
    next_cursor: String,
    has_more: bool,
    returned_count: usize,
    limit: usize,
    index_version: String,
    search_ms: u128,
    search_mode: &'static str,
    groups: Vec<SearchGroup>,
}

#[derive(Debug, Serialize)]
struct SourceVideoDetailResponse {
    source_video_id: String,
    title: String,
    duration_ms: u64,
    relative_path: String,
    cover_path: String,
    transcript_character_count: usize,
    transcript: SourceVideoTranscriptResponse,
}

#[derive(Debug, Serialize)]
struct SourceVideoTranscriptResponse {
    schema_version: &'static str,
    source_video_id: String,
    provider: &'static str,
    model: &'static str,
    generated_at: String,
    duration_ms: u64,
    full_text: String,
    segments: Vec<SourceVideoTranscriptSegment>,
}

#[derive(Debug, Serialize)]
struct SourceVideoTranscriptSegment {
    segment_id: String,
    index: usize,
    begin_ms: u64,
    end_ms: u64,
    begin_char: usize,
    end_char: usize,
    normalized_begin_char: usize,
    normalized_end_char: usize,
    text: String,
    normalized_text: String,
    confidence: f64,
}

#[derive(Debug, Clone, Serialize)]
struct SearchGroup {
    source_video_id: String,
    title: String,
    duration_ms: u64,
    relative_path: String,
    cover_path: String,
    hit_count: usize,
    best_excerpt: String,
    transcript_character_count: usize,
    hit_segments: Vec<SearchHitSegment>,
}

#[derive(Debug, Clone, Serialize)]
struct SearchHitSegment {
    segment_id: String,
    begin_ms: u64,
    end_ms: u64,
    text: String,
    match_ranges: Vec<[usize; 2]>,
    match_id: String,
    match_type: &'static str,
}

#[derive(Debug, Deserialize)]
struct CurrentPointer {
    current_version: String,
}

#[derive(Debug, Clone)]
struct IndexMetadata {
    index_version: String,
    source_video_count: usize,
    segment_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
struct SearchCacheMetadata {
    schema_version: String,
    index_version: String,
    source_video_count: usize,
    segment_count: usize,
}

#[derive(Debug, Clone)]
struct SegmentRecord {
    source_video_id: String,
    title: String,
    duration_ms: u64,
    relative_path: String,
    cover_path: String,
    segment_id: String,
    segment_index: usize,
    begin_ms: u64,
    end_ms: u64,
    text: String,
    normalized_text: String,
}

#[derive(Debug, Clone)]
struct NormalizedSegmentSpan {
    segment: SegmentRecord,
    normalized_start: usize,
    normalized_end: usize,
}

#[derive(Debug, Clone)]
struct VideoRecord {
    source_video_id: String,
    title: String,
    duration_ms: u64,
    relative_path: String,
    cover_path: String,
    transcript_character_count: usize,
    normalized_text: String,
    spans: Vec<NormalizedSegmentSpan>,
}

#[derive(Debug, Clone, Copy)]
struct SearchFields {
    doc_key: Field,
    video_key: Field,
    gram_text: Field,
}

struct IndexBundle {
    current_version: String,
    metadata: IndexMetadata,
    reader: IndexReader,
    fields: SearchFields,
    segments: Vec<SegmentRecord>,
    videos: Vec<VideoRecord>,
    video_indices_by_id: HashMap<String, usize>,
}

impl IndexBundle {
    fn reported_index_version(&self) -> String {
        if self.metadata.index_version.is_empty() {
            self.current_version.clone()
        } else {
            self.metadata.index_version.clone()
        }
    }
}

struct SearchEngine {
    library_root: PathBuf,
    cache_root: Option<PathBuf>,
    bundle: Arc<RwLock<Option<Arc<IndexBundle>>>>,
    refreshing_version: Arc<RwLock<Option<String>>>,
}

impl SearchEngine {
    fn new(library_root: PathBuf, cache_root: Option<PathBuf>) -> Self {
        Self {
            library_root,
            cache_root,
            bundle: Arc::new(RwLock::new(None)),
            refreshing_version: Arc::new(RwLock::new(None)),
        }
    }

    fn health(&self) -> Result<HealthResponse> {
        let bundle = self.ensure_bundle()?;
        Ok(HealthResponse {
            ok: true,
            library_root: self.library_root.to_string_lossy().to_string(),
            cache_root: self
                .cache_root
                .as_ref()
                .map(|path| path.to_string_lossy().to_string())
                .unwrap_or_default(),
            index_version: bundle.reported_index_version(),
            source_video_count: bundle.metadata.source_video_count,
            segment_count: bundle.metadata.segment_count,
        })
    }

    fn search(&self, query: &str, limit: usize, cursor: Option<&str>) -> Result<SearchResponse> {
        let started_at = Instant::now();
        let normalized_query = normalize_transcript_text(query);
        let offset = decode_cursor(cursor)?;
        let limit = limit.clamp(1, 100);
        let cursor_text = encode_cursor(offset);
        let bundle = self.ensure_bundle()?;

        if normalized_query.is_empty() {
            return Ok(SearchResponse {
                query: query.to_string(),
                normalized_query,
                cursor: cursor_text,
                next_cursor: String::new(),
                has_more: false,
                returned_count: 0,
                limit,
                index_version: bundle.reported_index_version(),
                search_ms: started_at.elapsed().as_millis(),
                search_mode: "searchd",
                groups: Vec::new(),
            });
        }

        let groups = search_bundle(&bundle, &normalized_query, offset, limit)?;
        let has_more = groups.has_more;

        Ok(SearchResponse {
            query: query.to_string(),
            normalized_query,
            cursor: cursor_text,
            next_cursor: if has_more {
                encode_cursor(offset + groups.groups.len())
            } else {
                String::new()
            },
            has_more,
            returned_count: groups.groups.len(),
            limit,
            index_version: bundle.reported_index_version(),
            search_ms: started_at.elapsed().as_millis(),
            search_mode: "searchd",
            groups: groups.groups,
        })
    }

    fn source_video_detail(
        &self,
        source_video_id: &str,
    ) -> Result<Option<SourceVideoDetailResponse>> {
        if !is_safe_source_video_id(source_video_id) {
            return Err(anyhow!("invalid_source_video_id"));
        }

        let bundle = self.ensure_bundle()?;
        Ok(source_video_detail_from_bundle(&bundle, source_video_id))
    }

    fn ensure_bundle(&self) -> Result<Arc<IndexBundle>> {
        let current = resolve_current_index(&self.library_root)?;

        {
            let guard = self
                .bundle
                .read()
                .map_err(|_| anyhow!("search index lock is poisoned"))?;
            if let Some(bundle) = guard.as_ref() {
                if bundle.current_version == current.current_version {
                    return Ok(Arc::clone(bundle));
                }

                self.refresh_bundle_in_background(current);
                return Ok(Arc::clone(bundle));
            }
        }

        let mut guard = self
            .bundle
            .write()
            .map_err(|_| anyhow!("search index lock is poisoned"))?;
        if let Some(bundle) = guard.as_ref() {
            if bundle.current_version == current.current_version {
                return Ok(Arc::clone(bundle));
            }
        }

        let bundle = Arc::new(load_index_bundle(
            &current.index_file_path,
            &current.current_version,
            self.cache_root.as_deref(),
        )?);
        *guard = Some(Arc::clone(&bundle));
        Ok(bundle)
    }

    fn refresh_bundle_in_background(&self, current: CurrentIndex) {
        let refresh_version = current.current_version.clone();
        {
            let Ok(mut guard) = self.refreshing_version.write() else {
                return;
            };
            if guard.as_deref() == Some(refresh_version.as_str()) {
                return;
            }

            *guard = Some(refresh_version.clone());
        }

        let bundle_lock = Arc::clone(&self.bundle);
        let refreshing_version = Arc::clone(&self.refreshing_version);
        let cache_root = self.cache_root.clone();

        thread::spawn(move || {
            let loaded = load_index_bundle(
                &current.index_file_path,
                &current.current_version,
                cache_root.as_deref(),
            )
            .map(Arc::new);

            if let Ok(bundle) = loaded {
                if let Ok(mut guard) = bundle_lock.write() {
                    *guard = Some(bundle);
                }
            }

            if let Ok(mut guard) = refreshing_version.write() {
                if guard.as_deref() == Some(refresh_version.as_str()) {
                    *guard = None;
                }
            }
        });
    }
}

struct CurrentIndex {
    current_version: String,
    index_file_path: PathBuf,
}

fn resolve_current_index(library_root: &Path) -> Result<CurrentIndex> {
    let current_path = library_root
        .join(".mixlab-library")
        .join("indexes")
        .join("source-transcript-index")
        .join("current.json");
    let pointer = fs::read_to_string(&current_path).with_context(|| {
        format!(
            "failed to read current index pointer: {}",
            current_path.display()
        )
    })?;
    let pointer: CurrentPointer = serde_json::from_str(&pointer).with_context(|| {
        format!(
            "failed to parse current index pointer: {}",
            current_path.display()
        )
    })?;
    if !is_safe_index_version(&pointer.current_version) {
        return Err(anyhow!(
            "invalid current index version: {}",
            pointer.current_version
        ));
    }

    Ok(CurrentIndex {
        index_file_path: library_root
            .join(".mixlab-library")
            .join("indexes")
            .join("source-transcript-index")
            .join(&pointer.current_version)
            .join("index.sqlite"),
        current_version: pointer.current_version,
    })
}

fn is_safe_index_version(version: &str) -> bool {
    version.len() == 7
        && version.starts_with('v')
        && version[1..]
            .chars()
            .all(|character| character.is_ascii_digit())
}

fn load_index_bundle(
    index_file_path: &Path,
    current_version: &str,
    cache_root: Option<&Path>,
) -> Result<IndexBundle> {
    let sqlite_index_file_path =
        cached_sqlite_index_path(index_file_path, current_version, cache_root)?;
    let connection =
        Connection::open_with_flags(&sqlite_index_file_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .with_context(|| {
                format!(
                    "failed to open sqlite index: {}",
                    sqlite_index_file_path.display()
                )
            })?;
    let metadata = read_metadata(&connection)?;
    let segments = read_segments(&connection)?;
    let video_character_counts = count_video_characters(&segments);
    let videos = build_video_records(&segments, &video_character_counts);
    let video_indices_by_id = videos
        .iter()
        .enumerate()
        .map(|(index, video)| (video.source_video_id.clone(), index))
        .collect::<HashMap<_, _>>();
    let (schema, fields) = build_schema();
    let index = open_or_build_tantivy_index(
        schema,
        fields,
        &segments,
        &videos,
        &metadata,
        current_version,
        cache_root,
    )?;
    let reader = index.reader()?;

    Ok(IndexBundle {
        current_version: current_version.to_string(),
        metadata,
        reader,
        fields,
        segments,
        videos,
        video_indices_by_id,
    })
}

fn cached_sqlite_index_path(
    source_index_file_path: &Path,
    current_version: &str,
    cache_root: Option<&Path>,
) -> Result<PathBuf> {
    let Some(cache_root) = cache_root else {
        return Ok(source_index_file_path.to_path_buf());
    };

    let source_metadata = fs::metadata(source_index_file_path).with_context(|| {
        format!(
            "failed to stat sqlite index: {}",
            source_index_file_path.display()
        )
    })?;
    let cache_dir = cache_root.join("sqlite").join(current_version);
    let cache_file_path = cache_dir.join("index.sqlite");

    if fs::metadata(&cache_file_path)
        .map(|metadata| metadata.len() == source_metadata.len())
        .unwrap_or(false)
    {
        return Ok(cache_file_path);
    }

    fs::create_dir_all(&cache_dir)?;
    let temp_file_path = cache_dir.join(format!(
        "index.sqlite.{}.{}.tmp",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or_default()
    ));

    if let Err(error) = fs::copy(source_index_file_path, &temp_file_path) {
        let _ = fs::remove_file(&temp_file_path);
        return Err(error).with_context(|| {
            format!(
                "failed to copy sqlite index from {} to {}",
                source_index_file_path.display(),
                temp_file_path.display()
            )
        });
    }

    if let Err(error) = fs::rename(&temp_file_path, &cache_file_path) {
        let _ = fs::remove_file(&temp_file_path);
        return Err(error).with_context(|| {
            format!(
                "failed to publish cached sqlite index: {}",
                cache_file_path.display()
            )
        });
    }

    Ok(cache_file_path)
}

fn expected_cache_metadata(current_version: &str, metadata: &IndexMetadata) -> SearchCacheMetadata {
    SearchCacheMetadata {
        schema_version: SEARCH_CACHE_SCHEMA_VERSION.to_string(),
        index_version: if metadata.index_version.is_empty() {
            current_version.to_string()
        } else {
            metadata.index_version.clone()
        },
        source_video_count: metadata.source_video_count,
        segment_count: metadata.segment_count,
    }
}

fn cache_version_root(cache_root: &Path, current_version: &str) -> PathBuf {
    cache_root.join("tantivy").join(current_version)
}

fn cache_metadata_path(cache_dir: &Path) -> PathBuf {
    cache_dir.join("mixlab-searchd-cache.json")
}

fn cache_is_valid(cache_dir: &Path, expected: &SearchCacheMetadata) -> bool {
    fs::read_to_string(cache_metadata_path(cache_dir))
        .ok()
        .and_then(|raw| serde_json::from_str::<SearchCacheMetadata>(&raw).ok())
        .map(|actual| {
            actual.schema_version == expected.schema_version
                && actual.index_version == expected.index_version
                && actual.source_video_count == expected.source_video_count
                && actual.segment_count == expected.segment_count
        })
        .unwrap_or(false)
}

fn unique_build_dir(cache_root: &Path, current_version: &str) -> PathBuf {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    cache_root.join("tantivy").join(format!(
        ".building-{current_version}-{}-{millis}",
        std::process::id()
    ))
}

fn write_cache_metadata(cache_dir: &Path, metadata: &SearchCacheMetadata) -> Result<()> {
    let raw = serde_json::to_string_pretty(metadata)?;
    fs::write(cache_metadata_path(cache_dir), format!("{raw}\n"))?;
    Ok(())
}

fn index_documents(
    index: &Index,
    fields: SearchFields,
    segments: &[SegmentRecord],
    videos: &[VideoRecord],
) -> Result<()> {
    let mut writer = index.writer(100_000_000)?;

    for (video_key, video) in videos.iter().enumerate() {
        writer.add_document(doc!(
            fields.video_key => video_key as u64,
            fields.gram_text => indexed_gram_text(&video.normalized_text),
        ))?;
    }

    for (doc_key, segment) in segments.iter().enumerate() {
        writer.add_document(doc!(
            fields.doc_key => doc_key as u64,
            fields.gram_text => indexed_gram_text(&segment.normalized_text),
        ))?;
    }

    writer.commit()?;
    Ok(())
}

fn build_persistent_tantivy_index(
    schema: Schema,
    fields: SearchFields,
    segments: &[SegmentRecord],
    videos: &[VideoRecord],
    current_version: &str,
    cache_root: &Path,
    expected: &SearchCacheMetadata,
) -> Result<Index> {
    let final_dir = cache_version_root(cache_root, current_version);
    let build_dir = unique_build_dir(cache_root, current_version);
    if build_dir.exists() {
        fs::remove_dir_all(&build_dir).ok();
    }
    fs::create_dir_all(&build_dir)?;

    let index = Index::create_in_dir(&build_dir, schema)?;
    index_documents(&index, fields, segments, videos)?;
    write_cache_metadata(&build_dir, expected)?;

    if final_dir.exists() {
        fs::remove_dir_all(&final_dir)?;
    }
    fs::create_dir_all(
        final_dir
            .parent()
            .ok_or_else(|| anyhow!("invalid searchd cache path"))?,
    )?;
    fs::rename(&build_dir, &final_dir)?;

    Ok(Index::open_in_dir(&final_dir)?)
}

fn open_or_build_tantivy_index(
    schema: Schema,
    fields: SearchFields,
    segments: &[SegmentRecord],
    videos: &[VideoRecord],
    metadata: &IndexMetadata,
    current_version: &str,
    cache_root: Option<&Path>,
) -> Result<Index> {
    let Some(cache_root) = cache_root else {
        let index = Index::create_in_ram(schema);
        index_documents(&index, fields, segments, videos)?;
        return Ok(index);
    };

    let expected = expected_cache_metadata(current_version, metadata);
    let cache_dir = cache_version_root(cache_root, current_version);
    if cache_is_valid(&cache_dir, &expected) {
        if let Ok(index) = Index::open_in_dir(&cache_dir) {
            return Ok(index);
        }
    }

    build_persistent_tantivy_index(
        schema,
        fields,
        segments,
        videos,
        current_version,
        cache_root,
        &expected,
    )
}

fn read_metadata(connection: &Connection) -> Result<IndexMetadata> {
    let mut statement = connection.prepare("SELECT key, value FROM metadata")?;
    let rows = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let metadata = rows.collect::<rusqlite::Result<HashMap<_, _>>>()?;

    Ok(IndexMetadata {
        index_version: metadata.get("index_version").cloned().unwrap_or_default(),
        source_video_count: metadata
            .get("source_video_count")
            .and_then(|value| value.parse::<usize>().ok())
            .unwrap_or_default(),
        segment_count: metadata
            .get("segment_count")
            .and_then(|value| value.parse::<usize>().ok())
            .unwrap_or_default(),
    })
}

fn read_segments(connection: &Connection) -> Result<Vec<SegmentRecord>> {
    let mut statement = connection.prepare(
        "\
        SELECT
          v.source_video_id,
          v.title,
          v.duration_ms,
          v.relative_path,
          v.cover_path,
          s.segment_id,
          s.segment_index,
          s.begin_ms,
          s.end_ms,
          s.text,
          s.normalized_text
        FROM segments s
        JOIN source_videos v ON v.source_video_id = s.source_video_id
        ORDER BY v.position ASC, s.segment_index ASC\
        ",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(SegmentRecord {
            source_video_id: row.get(0)?,
            title: row.get(1)?,
            duration_ms: row.get::<_, i64>(2)?.max(0) as u64,
            relative_path: row.get(3)?,
            cover_path: row.get(4)?,
            segment_id: row.get(5)?,
            segment_index: row.get::<_, i64>(6)?.max(0) as usize,
            begin_ms: row.get::<_, i64>(7)?.max(0) as u64,
            end_ms: row.get::<_, i64>(8)?.max(0) as u64,
            text: row.get(9)?,
            normalized_text: row.get(10)?,
        })
    })?;

    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn count_video_characters(segments: &[SegmentRecord]) -> HashMap<String, usize> {
    let mut counts = HashMap::new();
    for segment in segments {
        *counts.entry(segment.source_video_id.clone()).or_insert(0) += segment
            .text
            .chars()
            .filter(|character| !character.is_whitespace())
            .count();
    }
    counts
}

fn build_video_records(
    segments: &[SegmentRecord],
    video_character_counts: &HashMap<String, usize>,
) -> Vec<VideoRecord> {
    let mut videos = Vec::new();
    let mut current: Option<VideoRecord> = None;

    for segment in segments {
        let needs_new_video = current
            .as_ref()
            .map(|video| video.source_video_id != segment.source_video_id)
            .unwrap_or(true);

        if needs_new_video {
            if let Some(video) = current.take() {
                videos.push(video);
            }

            current = Some(VideoRecord {
                source_video_id: segment.source_video_id.clone(),
                title: segment.title.clone(),
                duration_ms: segment.duration_ms,
                relative_path: segment.relative_path.clone(),
                cover_path: segment.cover_path.clone(),
                transcript_character_count: video_character_counts
                    .get(&segment.source_video_id)
                    .copied()
                    .unwrap_or_else(|| {
                        segment
                            .text
                            .chars()
                            .filter(|character| !character.is_whitespace())
                            .count()
                    }),
                normalized_text: String::new(),
                spans: Vec::new(),
            });
        }

        if let Some(video) = current.as_mut() {
            let normalized_start = video.normalized_text.chars().count();
            video.normalized_text.push_str(&segment.normalized_text);
            let normalized_end = video.normalized_text.chars().count();
            video.spans.push(NormalizedSegmentSpan {
                segment: segment.clone(),
                normalized_start,
                normalized_end,
            });
        }
    }

    if let Some(video) = current {
        videos.push(video);
    }

    videos
}

fn build_schema() -> (Schema, SearchFields) {
    let mut builder = Schema::builder();
    let doc_key = builder.add_u64_field("doc_key", STORED);
    let video_key = builder.add_u64_field("video_key", STORED);
    let gram_text = builder.add_text_field("gram_text", TEXT);
    let schema = builder.build();
    (
        schema,
        SearchFields {
            doc_key,
            video_key,
            gram_text,
        },
    )
}

struct GroupSearchResult {
    groups: Vec<SearchGroup>,
    has_more: bool,
}

#[derive(Debug, Clone, Copy)]
struct NormalizedMatch {
    start: usize,
    end: usize,
    match_type: &'static str,
    score: i64,
}

struct RankedSearchGroup {
    group: SearchGroup,
    score: i64,
    source_order: usize,
}

fn search_bundle(
    bundle: &IndexBundle,
    normalized_query: &str,
    offset: usize,
    limit: usize,
) -> Result<GroupSearchResult> {
    let target_group_count = offset + limit + 1;
    let (precise_candidate_video_ids, mut has_more_from_window) =
        precise_candidate_video_ids_for_query(bundle, normalized_query, offset, limit)?;
    let mut groups = search_candidate_videos(
        bundle,
        &precise_candidate_video_ids,
        normalized_query,
        target_group_count,
    );

    let query_length = normalized_query.chars().count();
    let should_supplement_recall = groups.is_empty()
        || (groups.len() < target_group_count
            && query_length >= SUPPLEMENTAL_RECALL_MIN_QUERY_LENGTH);

    if should_supplement_recall {
        let (broad_candidate_video_ids, broad_has_more_from_window) =
            candidate_video_ids_for_query(bundle, normalized_query, offset, limit)?;
        has_more_from_window |= broad_has_more_from_window;
        let supplemental_candidate_video_ids = broad_candidate_video_ids
            .into_iter()
            .filter(|source_video_id| !precise_candidate_video_ids.contains(source_video_id))
            .collect::<Vec<_>>();
        let supplemental_groups = search_candidate_videos(
            bundle,
            &supplemental_candidate_video_ids,
            normalized_query,
            target_group_count,
        );
        for group in supplemental_groups {
            if groups
                .iter()
                .any(|existing| existing.source_video_id == group.source_video_id)
            {
                continue;
            }
            groups.push(group);
            if groups.len() >= target_group_count {
                break;
            }
        }
    }

    if groups.is_empty() {
        let supplemental_videos = bundle.videos.iter().enumerate().collect::<Vec<_>>();
        groups.extend(search_video_records(
            supplemental_videos,
            normalized_query,
            target_group_count,
        ));
    }

    let all_group_count = groups.len();
    let paged_groups = groups
        .into_iter()
        .skip(offset)
        .take(limit)
        .collect::<Vec<_>>();
    let has_more =
        paged_groups.len() == limit && (all_group_count > offset + limit || has_more_from_window);

    Ok(GroupSearchResult {
        groups: paged_groups,
        has_more,
    })
}

fn precise_candidate_video_ids_for_query(
    bundle: &IndexBundle,
    normalized_query: &str,
    offset: usize,
    limit: usize,
) -> Result<(Vec<String>, bool)> {
    let grams = query_grams(normalized_query);
    if grams.is_empty() {
        return Ok((Vec::new(), false));
    }

    let fetch_docs = ((offset + limit).max(limit) * 50).clamp(200, MAX_TANTIVY_DOCS);
    let query = BooleanQuery::intersection(tantivy_term_queries(bundle, &grams));
    let mut candidate_video_ids = Vec::new();
    let has_more_from_window =
        collect_tantivy_candidates(bundle, &query, fetch_docs, &mut candidate_video_ids)?;

    Ok((candidate_video_ids, has_more_from_window))
}

fn tantivy_term_queries(bundle: &IndexBundle, grams: &[String]) -> Vec<Box<dyn TantivyQuery>> {
    grams
        .iter()
        .map(|gram| {
            Box::new(TermQuery::new(
                Term::from_field_text(bundle.fields.gram_text, gram),
                IndexRecordOption::Basic,
            )) as Box<dyn TantivyQuery>
        })
        .collect()
}

fn push_candidate_video_id(candidate_video_ids: &mut Vec<String>, source_video_id: &str) {
    if !candidate_video_ids
        .iter()
        .any(|existing| existing == source_video_id)
    {
        candidate_video_ids.push(source_video_id.to_string());
    }
}

fn collect_tantivy_candidates(
    bundle: &IndexBundle,
    query: &dyn TantivyQuery,
    fetch_docs: usize,
    candidate_video_ids: &mut Vec<String>,
) -> Result<bool> {
    let searcher = bundle.reader.searcher();
    let top_docs = searcher.search(query, &TopDocs::with_limit(fetch_docs).order_by_score())?;
    for (_score, doc_address) in top_docs.iter() {
        let document = searcher.doc::<TantivyDocument>(*doc_address)?;
        if let Some(video_key) = document
            .get_first(bundle.fields.video_key)
            .and_then(|value| value.as_u64())
        {
            let Some(video) = bundle.videos.get(video_key as usize) else {
                continue;
            };
            push_candidate_video_id(candidate_video_ids, &video.source_video_id);
            continue;
        }

        if let Some(doc_key) = document
            .get_first(bundle.fields.doc_key)
            .and_then(|value| value.as_u64())
        {
            let Some(segment) = bundle.segments.get(doc_key as usize) else {
                continue;
            };
            push_candidate_video_id(candidate_video_ids, &segment.source_video_id);
        }
    }

    Ok(top_docs.len() == fetch_docs)
}

fn supplemental_candidate_anchor_texts(normalized_query: &str) -> Vec<String> {
    let query_length = normalized_query.chars().count();
    if query_length < 2 {
        return Vec::new();
    }

    if query_length >= LONG_QUERY_ANCHOR_THRESHOLD {
        return long_query_anchors(normalized_query)
            .into_iter()
            .map(|(text, _offset)| text)
            .collect();
    }

    let anchors = unique_anchors(
        normalized_query,
        anchor_length_for_query_length(query_length),
    );
    if anchors.len() <= MAX_SUPPLEMENTAL_ANCHOR_CANDIDATES {
        return anchors.into_iter().map(|(text, _offset)| text).collect();
    }

    let max_start = anchors.len().saturating_sub(1);
    let stride = 1.max(max_start.div_ceil(MAX_SUPPLEMENTAL_ANCHOR_CANDIDATES - 1));
    let mut selected = Vec::new();
    for (index, (text, _offset)) in anchors.iter().enumerate() {
        if index % stride == 0 {
            selected.push(text.clone());
        }
    }
    if let Some((last_text, _last_offset)) = anchors.last() {
        if !selected.iter().any(|text| text == last_text) {
            selected.push(last_text.clone());
        }
    }

    selected
}

fn candidate_video_ids_for_query(
    bundle: &IndexBundle,
    normalized_query: &str,
    offset: usize,
    limit: usize,
) -> Result<(Vec<String>, bool)> {
    let grams = query_grams(normalized_query);
    if grams.is_empty() {
        return Ok((Vec::new(), false));
    }

    let fetch_docs =
        ((offset + limit).max(limit) * 80).clamp(MIN_TANTIVY_CANDIDATE_DOCS, MAX_TANTIVY_DOCS);
    let supplemental_fetch_docs = (fetch_docs / 4).clamp(100, MAX_TANTIVY_DOCS);
    let mut candidate_video_ids = Vec::new();
    let mut has_more_from_window = false;

    let broad_query = BooleanQuery::union(tantivy_term_queries(bundle, &grams));
    has_more_from_window |=
        collect_tantivy_candidates(bundle, &broad_query, fetch_docs, &mut candidate_video_ids)?;

    for anchor_text in supplemental_candidate_anchor_texts(normalized_query) {
        let anchor_grams = query_grams(&anchor_text);
        if anchor_grams.is_empty() {
            continue;
        }
        let anchor_query = BooleanQuery::intersection(tantivy_term_queries(bundle, &anchor_grams));
        has_more_from_window |= collect_tantivy_candidates(
            bundle,
            &anchor_query,
            supplemental_fetch_docs,
            &mut candidate_video_ids,
        )?;
    }

    Ok((candidate_video_ids, has_more_from_window))
}

fn search_candidate_videos(
    bundle: &IndexBundle,
    candidate_video_ids: &[String],
    normalized_query: &str,
    max_groups: usize,
) -> Vec<SearchGroup> {
    let evaluation_limit = candidate_evaluation_limit(max_groups, normalized_query.chars().count());
    let videos = candidate_video_ids
        .iter()
        .take(evaluation_limit)
        .filter_map(|source_video_id| {
            let index = bundle.video_indices_by_id.get(source_video_id).copied()?;
            let video = bundle.videos.get(index)?;
            Some((index, video))
        })
        .collect::<Vec<_>>();

    search_video_records(videos, normalized_query, max_groups)
}

fn candidate_evaluation_limit(max_groups: usize, query_length: usize) -> usize {
    if query_length < SUPPLEMENTAL_RECALL_MIN_QUERY_LENGTH {
        return max_groups
            .saturating_mul(SHORT_QUERY_CANDIDATE_EVALUATION_MULTIPLIER)
            .min(MAX_SHORT_QUERY_CANDIDATE_EVALUATION_WINDOW)
            .max(max_groups);
    }

    max_groups
        .saturating_mul(CANDIDATE_EVALUATION_MULTIPLIER)
        .min(MAX_CANDIDATE_EVALUATION_WINDOW)
        .max(max_groups)
}

fn search_video_records(
    videos: Vec<(usize, &VideoRecord)>,
    normalized_query: &str,
    max_groups: usize,
) -> Vec<SearchGroup> {
    let mut ranked_groups = videos
        .into_iter()
        .filter_map(|(source_order, video)| {
            search_video_record(video, normalized_query, source_order)
        })
        .collect::<Vec<_>>();

    ranked_groups.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then(left.source_order.cmp(&right.source_order))
    });
    ranked_groups
        .into_iter()
        .take(max_groups)
        .map(|ranked| ranked.group)
        .collect()
}

fn search_video_record(
    video: &VideoRecord,
    normalized_query: &str,
    source_order: usize,
) -> Option<RankedSearchGroup> {
    let matches = video_matches(&video.normalized_text, normalized_query);
    if matches.is_empty() {
        return None;
    }

    let first_match_segments = hit_segments_for_video_match(video, matches[0], 0);
    let hit_segments = matches
        .iter()
        .enumerate()
        .flat_map(|(match_index, normalized_match)| {
            hit_segments_for_video_match(video, *normalized_match, match_index)
        })
        .collect::<Vec<_>>();

    if hit_segments.is_empty() {
        return None;
    }

    let score = average_match_score(&matches);
    Some(RankedSearchGroup {
        group: SearchGroup {
            source_video_id: video.source_video_id.clone(),
            title: video.title.clone(),
            duration_ms: video.duration_ms,
            relative_path: video.relative_path.clone(),
            cover_path: video.cover_path.clone(),
            hit_count: matches.len(),
            best_excerpt: first_match_segments
                .iter()
                .map(|segment| segment.text.as_str())
                .collect::<Vec<_>>()
                .join(""),
            transcript_character_count: video.transcript_character_count,
            hit_segments,
        },
        score,
        source_order,
    })
}

fn average_match_score(matches: &[NormalizedMatch]) -> i64 {
    if matches.is_empty() {
        return 0;
    }

    matches.iter().map(|item| item.score).sum::<i64>() / matches.len() as i64
}

fn exact_match_score(start: usize) -> i64 {
    1_000_000 - start as i64
}

fn long_group_match_score(group_len: usize, matched_chars: usize, start: usize) -> i64 {
    760_000 + group_len as i64 * 5_000 + matched_chars as i64 * 100 - start as i64
}

fn long_anchor_fallback_score(text_length: usize, start: usize) -> i64 {
    700_000 + text_length as i64 * 100 - start as i64
}

fn tolerant_match_score(query_length: usize, distance: usize, start: usize) -> i64 {
    let closeness_bonus = if query_length == 0 {
        0
    } else {
        (query_length.saturating_sub(distance) as i64 * 10_000) / query_length as i64
    };

    800_000 + closeness_bonus - start as i64
}

fn exact_normalized_matches(normalized_text: &str, normalized_query: &str) -> Vec<NormalizedMatch> {
    if normalized_query.is_empty() {
        return Vec::new();
    }

    let mut matches = Vec::new();
    let mut cursor = 0;
    let query_char_len = normalized_query.chars().count();
    let mut counted_byte = 0;
    let mut counted_chars = 0;

    while cursor <= normalized_text.len() {
        let Some(relative_start) = normalized_text[cursor..].find(normalized_query) else {
            break;
        };
        let start_byte = cursor + relative_start;
        counted_chars += normalized_text[counted_byte..start_byte].chars().count();
        counted_byte = start_byte;
        let start = counted_chars;
        matches.push(NormalizedMatch {
            start,
            end: start + query_char_len,
            match_type: "exact",
            score: exact_match_score(start),
        });
        cursor = start_byte + normalized_query.len().max(1);
    }

    matches
}

fn video_matches(normalized_text: &str, normalized_query: &str) -> Vec<NormalizedMatch> {
    let exact_matches = exact_normalized_matches(normalized_text, normalized_query);
    if !exact_matches.is_empty() {
        return exact_matches;
    }

    let long_matches = long_query_anchor_matches(normalized_text, normalized_query);
    if !long_matches.is_empty() {
        return long_matches;
    }

    tolerant_normalized_matches(normalized_text, normalized_query)
}

fn long_query_anchor_length(query_length: usize) -> usize {
    LONG_QUERY_MAX_ANCHOR_LENGTH.min(LONG_QUERY_MIN_ANCHOR_LENGTH.max(query_length / 6))
}

fn long_query_anchors(normalized_query: &str) -> Vec<(String, usize)> {
    let query_chars = normalized_query.chars().collect::<Vec<_>>();
    if query_chars.len() < LONG_QUERY_ANCHOR_THRESHOLD {
        return Vec::new();
    }

    let anchor_length = long_query_anchor_length(query_chars.len());
    let max_start = query_chars.len().saturating_sub(anchor_length);
    let stride = 1.max(max_start.div_ceil(1.max(LONG_QUERY_MAX_ANCHORS - 1)));
    let mut starts = Vec::new();
    let mut start = 0;
    while start <= max_start {
        if !starts.contains(&start) {
            starts.push(start);
        }
        start += stride;
    }
    if !starts.contains(&max_start) {
        starts.push(max_start);
    }

    let mut anchors = Vec::new();
    for offset in starts {
        let text = char_slice_text(&query_chars, offset, anchor_length);
        if text.chars().count() < LONG_QUERY_MIN_ANCHOR_LENGTH {
            continue;
        }
        if anchors
            .iter()
            .any(|(existing, _existing_offset): &(String, usize)| existing == &text)
        {
            continue;
        }
        anchors.push((text, offset));
    }

    anchors
}

#[derive(Debug, Clone)]
struct LongAnchorOccurrence {
    start: usize,
    end: usize,
    offset: usize,
    text_length: usize,
}

fn long_query_anchor_occurrences(
    normalized_text: &str,
    normalized_query: &str,
) -> Vec<LongAnchorOccurrence> {
    let anchors = long_query_anchors(normalized_query);
    let byte_offsets = byte_offsets_by_char(normalized_text);
    let mut occurrences = Vec::new();

    for (anchor_text, anchor_offset) in anchors {
        let mut cursor_byte = 0;
        while cursor_byte <= normalized_text.len() {
            let Some(relative_start) = normalized_text[cursor_byte..].find(&anchor_text) else {
                break;
            };
            let start_byte = cursor_byte + relative_start;
            let start = byte_offsets
                .iter()
                .position(|offset| *offset == start_byte)
                .unwrap_or_else(|| normalized_text[..start_byte].chars().count());
            let text_length = anchor_text.chars().count();
            occurrences.push(LongAnchorOccurrence {
                start,
                end: start + text_length,
                offset: anchor_offset,
                text_length,
            });
            cursor_byte = start_byte + anchor_text.len().max(1);
        }
    }

    occurrences.sort_by(|left, right| {
        left.offset
            .cmp(&right.offset)
            .then(left.start.cmp(&right.start))
    });
    occurrences
}

fn long_query_anchor_matches(
    normalized_text: &str,
    normalized_query: &str,
) -> Vec<NormalizedMatch> {
    let occurrences = long_query_anchor_occurrences(normalized_text, normalized_query);
    if occurrences.is_empty() {
        return Vec::new();
    }

    let mut matches: Vec<NormalizedMatch> = Vec::new();
    for first in &occurrences {
        let mut group = vec![first.clone()];

        for next in &occurrences {
            let Some(last) = group.last() else {
                continue;
            };
            if next.offset <= last.offset || next.start <= last.start {
                continue;
            }

            let query_delta = next.offset - first.offset;
            let text_delta = next.start - first.start;
            let max_drift = 10.max(query_delta * 22 / 100);
            if query_delta.abs_diff(text_delta) <= max_drift {
                group.push(next.clone());
            }
        }

        if group.len() < LONG_QUERY_MIN_GROUPED_ANCHORS {
            continue;
        }

        let Some(first_anchor) = group.first() else {
            continue;
        };
        let Some(last_anchor) = group.last() else {
            continue;
        };
        let matched_chars = group.iter().map(|anchor| anchor.text_length).sum::<usize>();
        let candidate = NormalizedMatch {
            start: first_anchor.start,
            end: last_anchor.end,
            match_type: "tolerant",
            score: long_group_match_score(group.len(), matched_chars, first_anchor.start),
        };
        if !matches
            .iter()
            .any(|existing| existing.start == candidate.start && existing.end == candidate.end)
        {
            matches.push(candidate);
        }
    }

    if matches.is_empty() {
        for occurrence in occurrences {
            if occurrence.text_length < LONG_QUERY_MAX_ANCHOR_LENGTH {
                continue;
            }
            matches.push(NormalizedMatch {
                start: occurrence.start,
                end: occurrence.end,
                match_type: "tolerant",
                score: long_anchor_fallback_score(occurrence.text_length, occurrence.start),
            });
        }
    }

    matches.sort_by(|left, right| left.start.cmp(&right.start));
    merge_overlapping_tolerant_matches(matches, normalized_query.chars().count())
}

fn max_errors_for_query_length(length: usize) -> usize {
    if length <= 4 {
        return 0;
    }

    if length <= 8 {
        return 1;
    }

    if length <= 15 {
        return 1.max(length * 15 / 100);
    }

    if length <= 40 {
        return 2.max(length * 18 / 100);
    }

    3.max(length * 16 / 100)
}

fn anchor_length_for_query_length(length: usize) -> usize {
    if length <= 8 {
        return 3;
    }

    if length <= 15 {
        return 4;
    }

    5
}

fn char_slice_text(chars: &[char], start: usize, length: usize) -> String {
    chars[start..start + length].iter().collect()
}

fn unique_anchors(normalized_query: &str, anchor_length: usize) -> Vec<(String, usize)> {
    let query_chars = normalized_query.chars().collect::<Vec<_>>();
    if query_chars.len() < anchor_length {
        return Vec::new();
    }

    let mut anchors = Vec::new();
    for offset in 0..=query_chars.len() - anchor_length {
        let text = char_slice_text(&query_chars, offset, anchor_length);
        if !anchors
            .iter()
            .any(|(existing, existing_offset): &(String, usize)| {
                existing == &text && *existing_offset == offset
            })
        {
            anchors.push((text, offset));
        }
    }

    anchors
}

fn byte_offsets_by_char(text: &str) -> Vec<usize> {
    let mut offsets = text
        .char_indices()
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    offsets.push(text.len());
    offsets
}

fn limited_edit_distance(a: &[char], b: &[char], max_distance: usize) -> usize {
    if a.len().abs_diff(b.len()) > max_distance {
        return max_distance + 1;
    }

    let mut previous = (0..=b.len()).collect::<Vec<_>>();
    for row in 1..=a.len() {
        let mut current = vec![row];
        let mut row_min = row;

        for column in 1..=b.len() {
            let substitution_cost = if a[row - 1] == b[column - 1] { 0 } else { 1 };
            let value = (previous[column] + 1)
                .min(current[column - 1] + 1)
                .min(previous[column - 1] + substitution_cost);
            current.push(value);
            row_min = row_min.min(value);
        }

        if row_min > max_distance {
            return max_distance + 1;
        }

        previous = current;
    }

    previous[b.len()]
}

fn merge_overlapping_tolerant_matches(
    matches: Vec<NormalizedMatch>,
    _query_length: usize,
) -> Vec<NormalizedMatch> {
    let mut sorted = matches;
    sorted.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then(left.start.cmp(&right.start))
            .then(
                right
                    .end
                    .saturating_sub(right.start)
                    .cmp(&left.end.saturating_sub(left.start)),
            )
    });

    let mut accepted: Vec<NormalizedMatch> = Vec::new();
    for candidate in sorted {
        let overlaps = accepted
            .iter()
            .any(|existing| existing.start.max(candidate.start) < existing.end.min(candidate.end));
        if !overlaps {
            accepted.push(candidate);
        }
    }

    accepted.sort_by(|left, right| left.start.cmp(&right.start));
    accepted
}

fn tolerant_normalized_matches(
    normalized_text: &str,
    normalized_query: &str,
) -> Vec<NormalizedMatch> {
    let query_chars = normalized_query.chars().collect::<Vec<_>>();
    let query_length = query_chars.len();
    let max_errors = max_errors_for_query_length(query_length);
    if max_errors == 0 || normalized_text.is_empty() {
        return Vec::new();
    }

    let text_chars = normalized_text.chars().collect::<Vec<_>>();
    let byte_offsets = byte_offsets_by_char(normalized_text);
    let anchor_length = anchor_length_for_query_length(query_length);
    let anchors = unique_anchors(normalized_query, anchor_length);
    let mut matches: Vec<NormalizedMatch> = Vec::new();

    for (anchor_text, anchor_offset) in anchors {
        let mut cursor_byte = 0;
        while cursor_byte <= normalized_text.len() {
            let Some(relative_start) = normalized_text[cursor_byte..].find(&anchor_text) else {
                break;
            };
            let anchor_start_byte = cursor_byte + relative_start;
            let anchor_start_char = byte_offsets
                .iter()
                .position(|offset| *offset == anchor_start_byte)
                .unwrap_or_else(|| normalized_text[..anchor_start_byte].chars().count());
            let base_start = anchor_start_char as isize - anchor_offset as isize;

            for start_delta in -(max_errors as isize)..=(max_errors as isize) {
                let start = base_start + start_delta;
                if start < 0 {
                    continue;
                }
                let start = start as usize;
                if start >= text_chars.len() {
                    continue;
                }

                let min_length = query_length.saturating_sub(max_errors).max(1);
                let max_length = query_length + max_errors;
                for length in min_length..=max_length {
                    if start + length > text_chars.len() {
                        continue;
                    }

                    let candidate = &text_chars[start..start + length];
                    if candidate == query_chars.as_slice() {
                        continue;
                    }

                    let distance = limited_edit_distance(&query_chars, candidate, max_errors);
                    if distance > max_errors {
                        continue;
                    }

                    let candidate_match = NormalizedMatch {
                        start,
                        end: start + length,
                        match_type: "tolerant",
                        score: tolerant_match_score(query_length, distance, start),
                    };
                    if !matches.iter().any(|existing| {
                        existing.start == candidate_match.start
                            && existing.end == candidate_match.end
                    }) {
                        matches.push(candidate_match);
                    }
                }
            }

            cursor_byte = anchor_start_byte + anchor_text.len().max(1);
        }
    }

    merge_overlapping_tolerant_matches(matches, query_length)
}

fn hit_segments_for_video_match(
    video: &VideoRecord,
    normalized_match: NormalizedMatch,
    match_index: usize,
) -> Vec<SearchHitSegment> {
    let match_id = format!("{}-M{:06}", video.source_video_id, match_index + 1);

    video
        .spans
        .iter()
        .filter_map(|span| {
            if span.normalized_end <= normalized_match.start
                || span.normalized_start >= normalized_match.end
            {
                return None;
            }

            let range_start = normalized_match.start.saturating_sub(span.normalized_start);
            let range_end = (normalized_match.end - span.normalized_start)
                .min(span.normalized_end - span.normalized_start);
            let match_ranges =
                match_ranges_for_normalized_range(&span.segment.text, range_start, range_end);
            if match_ranges.is_empty() {
                return None;
            }

            Some(SearchHitSegment {
                segment_id: span.segment.segment_id.clone(),
                begin_ms: span.segment.begin_ms,
                end_ms: span.segment.end_ms,
                text: span.segment.text.clone(),
                match_ranges,
                match_id: match_id.clone(),
                match_type: normalized_match.match_type,
            })
        })
        .collect()
}

fn match_ranges_for_normalized_range(
    text: &str,
    normalized_start: usize,
    normalized_end: usize,
) -> Vec<[usize; 2]> {
    if normalized_end <= normalized_start {
        return Vec::new();
    }

    let (_normalized_text, mapping) = normalize_with_mapping(text);
    let Some(original_start) = mapping.get(normalized_start).copied() else {
        return Vec::new();
    };
    let Some(original_end_last) = mapping.get(normalized_end.saturating_sub(1)).copied() else {
        return Vec::new();
    };

    vec![[original_start, original_end_last + 1]]
}

fn is_safe_source_video_id(source_video_id: &str) -> bool {
    source_video_id.len() == 7
        && source_video_id.starts_with('V')
        && source_video_id[1..]
            .chars()
            .all(|character| character.is_ascii_digit())
}

fn source_video_detail_from_bundle(
    bundle: &IndexBundle,
    source_video_id: &str,
) -> Option<SourceVideoDetailResponse> {
    let video_index = bundle.video_indices_by_id.get(source_video_id).copied()?;
    let video = bundle.videos.get(video_index)?;
    let mut full_text = String::new();
    let mut normalized_full_text = String::new();
    let mut segments = Vec::with_capacity(video.spans.len());

    for span in &video.spans {
        let record = &span.segment;
        let begin_char = full_text.chars().count();
        let normalized_begin_char = normalized_full_text.chars().count();
        full_text.push_str(&record.text);
        normalized_full_text.push_str(&record.normalized_text);
        let end_char = full_text.chars().count();
        let normalized_end_char = normalized_full_text.chars().count();

        segments.push(SourceVideoTranscriptSegment {
            segment_id: record.segment_id.clone(),
            index: record.segment_index,
            begin_ms: record.begin_ms,
            end_ms: record.end_ms,
            begin_char,
            end_char,
            normalized_begin_char,
            normalized_end_char,
            text: record.text.clone(),
            normalized_text: record.normalized_text.clone(),
            confidence: 1.0,
        });
    }

    Some(SourceVideoDetailResponse {
        source_video_id: video.source_video_id.clone(),
        title: video.title.clone(),
        duration_ms: video.duration_ms,
        relative_path: video.relative_path.clone(),
        cover_path: video.cover_path.clone(),
        transcript_character_count: video.transcript_character_count,
        transcript: SourceVideoTranscriptResponse {
            schema_version: "1.0",
            source_video_id: video.source_video_id.clone(),
            provider: "sqlite-index",
            model: "source-transcript-index",
            generated_at: String::new(),
            duration_ms: video.duration_ms,
            full_text,
            segments,
        },
    })
}

fn indexed_gram_text(normalized_text: &str) -> String {
    let mut grams = Vec::new();
    let characters = normalized_text.chars().collect::<Vec<_>>();
    for character in &characters {
        grams.push(character.to_string());
    }
    for pair in characters.windows(2) {
        grams.push(pair.iter().collect::<String>());
    }
    grams.sort();
    grams.dedup();
    grams.join(" ")
}

fn query_grams(normalized_query: &str) -> Vec<String> {
    let characters = normalized_query.chars().collect::<Vec<_>>();
    if characters.len() <= 1 {
        return characters
            .into_iter()
            .map(|character| character.to_string())
            .collect();
    }

    let mut grams = characters
        .windows(2)
        .map(|pair| pair.iter().collect::<String>())
        .collect::<Vec<_>>();
    grams.sort();
    grams.dedup();
    grams
}

fn encode_cursor(offset: usize) -> String {
    if offset == 0 {
        String::new()
    } else {
        format!("{CURSOR_PREFIX}{offset}")
    }
}

fn decode_cursor(cursor: Option<&str>) -> Result<usize> {
    let Some(cursor) = cursor.map(str::trim).filter(|cursor| !cursor.is_empty()) else {
        return Ok(0);
    };
    let offset_text = cursor.strip_prefix(CURSOR_PREFIX).unwrap_or(cursor);
    let offset = offset_text
        .parse::<usize>()
        .map_err(|_| anyhow!("invalid_search_cursor"))?;
    if encode_cursor(offset)
        .strip_prefix(CURSOR_PREFIX)
        .unwrap_or("")
        != offset_text
        && offset != 0
    {
        return Err(anyhow!("invalid_search_cursor"));
    }
    Ok(offset)
}

fn normalize_transcript_text(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .filter(|character| should_keep_normalized_character(*character))
        .collect()
}

fn should_keep_normalized_character(character: char) -> bool {
    if character.is_whitespace() {
        return false;
    }
    !matches!(
        get_general_category(character),
        GeneralCategory::ClosePunctuation
            | GeneralCategory::ConnectorPunctuation
            | GeneralCategory::CurrencySymbol
            | GeneralCategory::DashPunctuation
            | GeneralCategory::FinalPunctuation
            | GeneralCategory::InitialPunctuation
            | GeneralCategory::MathSymbol
            | GeneralCategory::ModifierSymbol
            | GeneralCategory::OpenPunctuation
            | GeneralCategory::OtherPunctuation
            | GeneralCategory::OtherSymbol
    )
}

fn normalize_with_mapping(text: &str) -> (String, Vec<usize>) {
    let mut normalized = String::new();
    let mut mapping = Vec::new();

    for (index, character) in text.to_lowercase().chars().enumerate() {
        if should_keep_normalized_character(character) {
            normalized.push(character);
            mapping.push(index);
        }
    }

    (normalized, mapping)
}

#[derive(Clone)]
struct AppState {
    engine: Arc<SearchEngine>,
}

async fn health_handler(
    State(state): State<AppState>,
) -> Result<Json<ApiEnvelope<HealthResponse>>, ApiError> {
    let data = state
        .engine
        .health()
        .map_err(|error| ApiError::internal(error.to_string()))?;
    Ok(Json(ApiEnvelope {
        schema_version: "1.0",
        data,
    }))
}

async fn source_search_handler(
    State(state): State<AppState>,
    Query(query): Query<SearchQuery>,
) -> Result<Json<ApiEnvelope<SearchResponse>>, ApiError> {
    let limit = query.limit.unwrap_or(10);
    if !(1..=100).contains(&limit) {
        return Err(ApiError::bad_request(
            "invalid_limit",
            "limit must be an integer between 1 and 100",
        ));
    }

    let data = state
        .engine
        .search(&query.query, limit, query.cursor.as_deref())
        .map_err(|error| {
            if error.to_string().contains("invalid_search_cursor") {
                ApiError::bad_request("invalid_search_cursor", "搜索分页游标格式不正确")
            } else {
                ApiError::internal(error.to_string())
            }
        })?;

    Ok(Json(ApiEnvelope {
        schema_version: "1.0",
        data,
    }))
}

async fn source_video_detail_handler(
    State(state): State<AppState>,
    AxumPath(source_video_id): AxumPath<String>,
) -> Result<Json<ApiEnvelope<SourceVideoDetailResponse>>, ApiError> {
    let data = state
        .engine
        .source_video_detail(&source_video_id)
        .map_err(|error| {
            if error.to_string().contains("invalid_source_video_id") {
                ApiError::bad_request("invalid_source_video_id", "source_video_id 格式不正确")
            } else {
                ApiError::internal(error.to_string())
            }
        })?
        .ok_or_else(|| ApiError {
            status: StatusCode::NOT_FOUND,
            code: "source_video_not_found",
            message: "Source video not found".to_string(),
        })?;

    Ok(Json(ApiEnvelope {
        schema_version: "1.0",
        data,
    }))
}

fn app(engine: Arc<SearchEngine>) -> Router {
    Router::new()
        .route("/health", get(health_handler))
        .route("/source-search", get(source_search_handler))
        .route(
            "/source-videos/{source_video_id}/detail",
            get(source_video_detail_handler),
        )
        .with_state(AppState { engine })
}

#[tokio::main]
async fn main() -> Result<()> {
    let config = SearchdConfig::from_env_and_args()?;
    let engine = Arc::new(SearchEngine::new(
        config.library_root.clone(),
        config.cache_root.clone(),
    ));
    let address = format!("{}:{}", config.host, config.port)
        .parse::<SocketAddr>()
        .with_context(|| format!("invalid listen address {}:{}", config.host, config.port))?;
    let listener = tokio::net::TcpListener::bind(address).await?;

    println!(
        "{}",
        serde_json::json!({
            "event": "mixlab_searchd_started",
            "url": format!("http://{address}"),
            "library_root": config.library_root,
            "cache_root": config.cache_root,
            "endpoints": ["/health", "/source-search", "/source-videos/{source_video_id}/detail"]
        })
    );

    axum::serve(listener, app(engine))
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{to_bytes, Body},
        http::Request,
    };
    use rusqlite::params;
    use std::time::Duration;
    use tempfile::TempDir;
    use tower::ServiceExt;

    #[test]
    fn normalization_removes_unicode_punctuation_and_symbols() {
        assert_eq!(
            normalize_transcript_text("现金流，是 ROI + 利润。"),
            "现金流是roi利润"
        );
    }

    #[test]
    fn cursor_round_trips_plain_and_prefixed_offsets() {
        assert_eq!(decode_cursor(None).unwrap(), 0);
        assert_eq!(decode_cursor(Some("searchd:10")).unwrap(), 10);
        assert_eq!(decode_cursor(Some("20")).unwrap(), 20);
        assert!(decode_cursor(Some("searchd:bad")).is_err());
    }

    #[test]
    fn searches_current_sqlite_index_with_tantivy() {
        let library = prepare_library(&[
            (
                "V000001",
                "直播复盘",
                "现金流，是企业的血液。",
                "现金流是企业的血液",
            ),
            (
                "V000002",
                "投放复盘",
                "投放回收周期决定现金流健康。",
                "投放回收周期决定现金流健康",
            ),
        ]);
        let engine = SearchEngine::new(library.path().to_path_buf(), None);

        let result = engine.search("现金流", 10, None).unwrap();

        assert_eq!(result.index_version, "v000001");
        assert_eq!(result.search_mode, "searchd");
        assert_eq!(result.returned_count, 2);
        assert_eq!(result.groups[0].source_video_id, "V000001");
        assert_eq!(result.groups[0].hit_segments[0].match_ranges, vec![[0, 3]]);
    }

    #[test]
    fn searches_exact_text_across_adjacent_transcript_segments() {
        let library = prepare_library_with_segments(&[(
            "V000001",
            "直播复盘",
            vec![
                ("现金流，是企业", "现金流是企业"),
                ("的血液，也能判断风险。", "的血液也能判断风险"),
            ],
        )]);
        let engine = SearchEngine::new(library.path().to_path_buf(), None);

        let result = engine.search("企业的血液", 10, None).unwrap();

        assert_eq!(result.returned_count, 1);
        assert_eq!(result.groups[0].source_video_id, "V000001");
        assert_eq!(result.groups[0].hit_count, 1);
        assert_eq!(
            result.groups[0]
                .hit_segments
                .iter()
                .map(|segment| segment.segment_id.as_str())
                .collect::<Vec<_>>(),
            vec!["V000001-S000001", "V000001-S000002"]
        );
        assert_eq!(result.groups[0].hit_segments[0].match_ranges, vec![[5, 7]]);
        assert_eq!(result.groups[0].hit_segments[1].match_ranges, vec![[0, 3]]);
        assert_eq!(
            result.groups[0].hit_segments[0].match_id,
            result.groups[0].hit_segments[1].match_id
        );
        assert_eq!(
            result.groups[0].best_excerpt,
            "现金流，是企业的血液，也能判断风险。"
        );
    }

    #[test]
    fn video_level_index_keeps_cross_segment_hits_with_segment_exact_hits() {
        let library = prepare_library_with_segments(&[
            (
                "V000001",
                "跨段素材",
                vec![
                    ("现金流，是企业", "现金流是企业"),
                    ("的血液，也能判断风险。", "的血液也能判断风险"),
                ],
            ),
            (
                "V000002",
                "单段素材",
                vec![(
                    "这一段直接说企业的血液，适合快速命中。",
                    "这一段直接说企业的血液适合快速命中",
                )],
            ),
        ]);
        let engine = SearchEngine::new(library.path().to_path_buf(), None);

        let result = engine.search("企业的血液", 10, None).unwrap();
        let source_video_ids = result
            .groups
            .iter()
            .map(|group| group.source_video_id.as_str())
            .collect::<Vec<_>>();

        assert_eq!(result.returned_count, 2);
        assert!(source_video_ids.contains(&"V000001"));
        assert!(source_video_ids.contains(&"V000002"));
        let cross_segment_group = result
            .groups
            .iter()
            .find(|group| group.source_video_id == "V000001")
            .expect("cross-segment group");
        assert_eq!(
            cross_segment_group
                .hit_segments
                .iter()
                .map(|segment| segment.segment_id.as_str())
                .collect::<Vec<_>>(),
            vec!["V000001-S000001", "V000001-S000002"]
        );
    }

    #[test]
    fn tolerates_one_asr_style_character_error_for_medium_queries() {
        let library = prepare_library(&[(
            "V000001",
            "直播复盘",
            "现金流，是企业的血液。",
            "现金流是企业的血液",
        )]);
        let engine = SearchEngine::new(library.path().to_path_buf(), None);

        let result = engine.search("现金流是企业的血夜", 10, None).unwrap();

        assert_eq!(result.returned_count, 1);
        assert_eq!(result.groups[0].source_video_id, "V000001");
        assert_eq!(result.groups[0].hit_count, 1);
        assert_eq!(result.groups[0].hit_segments[0].match_type, "tolerant");
        assert_eq!(
            result.groups[0].hit_segments[0].text,
            "现金流，是企业的血液。"
        );
    }

    #[test]
    fn ranks_exact_matches_ahead_of_weaker_tolerant_matches() {
        let library = prepare_library(&[
            (
                "V000010",
                "ASR 有误课程",
                "现金流，是企业的血夜。",
                "现金流是企业的血夜",
            ),
            (
                "V000001",
                "老板现金流课程",
                "现金流，是企业的血液。",
                "现金流是企业的血液",
            ),
        ]);
        let engine = SearchEngine::new(library.path().to_path_buf(), None);

        let result = engine.search("现金流，是企业的血液", 10, None).unwrap();

        assert_eq!(
            result
                .groups
                .iter()
                .map(|group| group.source_video_id.as_str())
                .collect::<Vec<_>>(),
            vec!["V000001", "V000010"]
        );
        assert_eq!(result.groups[0].hit_segments[0].match_type, "exact");
        assert_eq!(result.groups[1].hit_segments[0].match_type, "tolerant");
    }

    #[test]
    fn does_not_tolerate_one_character_error_for_short_queries() {
        let library = prepare_library(&[(
            "V000001",
            "组织增长课",
            "组织效率决定增长。",
            "组织效率决定增长",
        )]);
        let engine = SearchEngine::new(library.path().to_path_buf(), None);

        let result = engine.search("组织校率", 10, None).unwrap();

        assert_eq!(result.returned_count, 0);
        assert!(result.groups.is_empty());
    }

    #[test]
    fn tantivy_candidates_cover_tolerant_and_long_anchor_queries() {
        let library = prepare_library_with_segments(&[(
            "V000001",
            "平台合伙人课",
            vec![
                (
                    "未来中国将走向一个阶段，叫企业平台化，员工老板创业化。",
                    "未来中国将走向一个阶段叫企业平台化员工老板创业化",
                ),
                (
                    "你要防备的是你的同行推出平台合伙人，把你的优质人才卷到他的平台上。",
                    "你要防备的是你的同行推出平台合伙人把你的优质人才卷到他的平台上",
                ),
                (
                    "所以我们再提出来叫做企业平台化，员工老板创业化。",
                    "所以我们再提出来叫做企业平台化员工老板创业化",
                ),
            ],
        )]);
        let engine = SearchEngine::new(library.path().to_path_buf(), None);
        let bundle = engine.ensure_bundle().unwrap();

        let tolerant_query = normalize_transcript_text("把你的优质人才卷到他的平台尚");
        let (tolerant_ids, _) =
            candidate_video_ids_for_query(&bundle, &tolerant_query, 0, 10).unwrap();
        assert!(tolerant_ids.iter().any(|id| id == "V000001"));

        let long_query = normalize_transcript_text(
            "这段开头来自用户粘贴内容，但在素材转写里已经被剪掉了，还有几句话也没有被识别到。\
             未来中国将走向一个阶段，叫企业平台化，员工老板创业化。你要防备的是你的同行推出平台合伙人，\
             把你的优质人才卷到他的平台上。所以我们再提出来叫做企业平台化，员工老板创业化。",
        );
        let (long_ids, _) = candidate_video_ids_for_query(&bundle, &long_query, 0, 10).unwrap();
        assert!(long_ids.iter().any(|id| id == "V000001"));
    }

    #[test]
    fn anchors_long_pasted_queries_when_the_beginning_is_not_in_transcript() {
        let library = prepare_library_with_segments(&[(
            "V000001",
            "平台合伙人课",
            vec![
                (
                    "未来中国将走向一个阶段，叫企业平台化，员工老板创业化。",
                    "未来中国将走向一个阶段叫企业平台化员工老板创业化",
                ),
                (
                    "你要防备的是你的同行推出平台合伙人，把你的优质人才卷到他的平台上。",
                    "你要防备的是你的同行推出平台合伙人把你的优质人才卷到他的平台上",
                ),
                (
                    "所以我们再提出来叫做企业平台化，员工老板创业化。",
                    "所以我们再提出来叫做企业平台化员工老板创业化",
                ),
            ],
        )]);
        let engine = SearchEngine::new(library.path().to_path_buf(), None);

        let result = engine
            .search(
                "这段开头来自用户粘贴内容，但在素材转写里已经被剪掉了，还有几句话也没有被识别到。\
                 未来中国将走向一个阶段，叫企业平台化，员工老板创业化。你要防备的是你的同行推出平台合伙人，\
                 把你的优质人才卷到他的平台上。所以我们再提出来叫做企业平台化，员工老板创业化。",
                10,
                None,
            )
            .unwrap();

        assert_eq!(result.returned_count, 1);
        assert_eq!(result.groups[0].source_video_id, "V000001");
        assert_eq!(
            result.groups[0]
                .hit_segments
                .iter()
                .map(|segment| segment.segment_id.as_str())
                .collect::<Vec<_>>(),
            vec!["V000001-S000001", "V000001-S000002", "V000001-S000003"]
        );
        assert_eq!(result.groups[0].hit_segments[0].match_type, "tolerant");
        assert_eq!(
            result.groups[0].best_excerpt,
            "未来中国将走向一个阶段，叫企业平台化，员工老板创业化。你要防备的是你的同行推出平台合伙人，把你的优质人才卷到他的平台上。所以我们再提出来叫做企业平台化，员工老板创业化。"
        );
    }

    #[test]
    fn source_video_detail_returns_full_transcript_from_loaded_index() {
        let library = prepare_library(&[(
            "V000001",
            "直播复盘",
            "现金流，是企业的血液。",
            "现金流是企业的血液",
        )]);
        let engine = SearchEngine::new(library.path().to_path_buf(), None);

        let detail = engine
            .source_video_detail("V000001")
            .unwrap()
            .expect("indexed source detail");

        assert_eq!(detail.source_video_id, "V000001");
        assert_eq!(detail.transcript.full_text, "现金流，是企业的血液。");
        assert_eq!(detail.transcript.segments[0].segment_id, "V000001-S000001");
        assert_eq!(detail.transcript.segments[0].begin_char, 0);
        assert_eq!(detail.transcript.segments[0].end_char, 11);
        assert!(engine.source_video_detail("V999999").unwrap().is_none());
    }

    #[test]
    fn transcript_character_count_ignores_whitespace() {
        let library = prepare_library(&[(
            "V000001",
            "直播复盘",
            "现金流 是 企业 的 血液。",
            "现金流是企业的血液",
        )]);
        let engine = SearchEngine::new(library.path().to_path_buf(), None);

        let result = engine.search("现金流", 10, None).unwrap();

        assert_eq!(result.groups[0].transcript_character_count, 10);
    }

    #[test]
    fn cursor_paginates_grouped_videos() {
        let library = prepare_library(&[
            ("V000001", "一号", "现金流第一句。", "现金流第一句"),
            ("V000002", "二号", "现金流第二句。", "现金流第二句"),
            ("V000003", "三号", "现金流第三句。", "现金流第三句"),
        ]);
        let engine = SearchEngine::new(library.path().to_path_buf(), None);

        let first = engine.search("现金流", 1, None).unwrap();
        assert_eq!(first.groups.len(), 1);
        assert_eq!(first.has_more, true);
        assert_eq!(first.next_cursor, "searchd:1");

        let second = engine
            .search("现金流", 1, Some(&first.next_cursor))
            .unwrap();
        assert_eq!(second.groups.len(), 1);
        assert_ne!(
            first.groups[0].source_video_id,
            second.groups[0].source_video_id
        );
    }

    #[test]
    fn ranked_cursor_pages_match_single_full_page_for_short_queries() {
        let library = prepare_library(&[
            ("V000001", "一号", "甲乙丙现金流丁", "甲乙丙现金流丁"),
            ("V000002", "二号", "甲乙现金流丙丁", "甲乙现金流丙丁"),
            ("V000003", "三号", "甲现金流乙丙丁", "甲现金流乙丙丁"),
            ("V000004", "四号", "现金流甲乙丙丁", "现金流甲乙丙丁"),
            ("V000005", "五号", "甲乙丙丁现金流", "甲乙丙丁现金流"),
        ]);
        let engine = SearchEngine::new(library.path().to_path_buf(), None);

        let full = engine.search("现金流", 4, None).unwrap();
        let full_ids = full
            .groups
            .iter()
            .map(|group| group.source_video_id.as_str())
            .collect::<Vec<_>>();

        let mut cursor: Option<String> = None;
        let mut paged_ids = Vec::new();
        for _ in 0..4 {
            let page = engine.search("现金流", 1, cursor.as_deref()).unwrap();
            assert_eq!(page.groups.len(), 1);
            paged_ids.push(page.groups[0].source_video_id.clone());
            cursor = page.has_more.then_some(page.next_cursor);
        }

        assert_eq!(
            paged_ids.iter().map(String::as_str).collect::<Vec<_>>(),
            full_ids
        );
        assert_eq!(full_ids, vec!["V000004", "V000003", "V000002", "V000001"]);
    }

    #[test]
    fn persistent_cache_survives_searchd_restart() {
        let library = prepare_library(&[
            ("V000001", "一号", "现金流第一句。", "现金流第一句"),
            ("V000002", "二号", "现金流第二句。", "现金流第二句"),
        ]);
        let cache = TempDir::new().unwrap();
        let cache_root = cache.path().to_path_buf();

        let first_engine =
            SearchEngine::new(library.path().to_path_buf(), Some(cache_root.clone()));
        let first = first_engine.search("现金流", 10, None).unwrap();
        assert_eq!(first.returned_count, 2);

        assert!(cache_root
            .join("sqlite")
            .join("v000001")
            .join("index.sqlite")
            .is_file());
        let cache_dir = cache_root.join("tantivy").join("v000001");
        assert!(cache_dir.join("meta.json").is_file());
        assert!(cache_dir.join("mixlab-searchd-cache.json").is_file());

        let restarted_engine = SearchEngine::new(library.path().to_path_buf(), Some(cache_root));
        let restarted = restarted_engine.search("现金流", 10, None).unwrap();
        assert_eq!(restarted.returned_count, 2);
        assert_eq!(restarted.groups[0].source_video_id, "V000001");
    }

    #[test]
    fn search_uses_hot_bundle_while_refreshing_changed_current_index() {
        let library = prepare_library(&[("V000001", "一号", "现金流第一句。", "现金流第一句")]);
        let engine = SearchEngine::new(library.path().to_path_buf(), None);

        let first = engine.search("现金流", 10, None).unwrap();
        assert_eq!(first.index_version, "v000001");
        assert_eq!(first.returned_count, 1);

        write_index_package(
            library.path(),
            "v000002",
            &[(
                "V000002",
                "二号",
                vec![("组织效率决定增长。", "组织效率决定增长")],
            )],
        );

        let stale = engine.search("组织效率", 10, None).unwrap();
        assert_eq!(stale.index_version, "v000001");
        assert_eq!(stale.returned_count, 0);

        for _ in 0..50 {
            let refreshed = engine.search("组织效率", 10, None).unwrap();
            if refreshed.index_version == "v000002" {
                assert_eq!(refreshed.returned_count, 1);
                assert_eq!(refreshed.groups[0].source_video_id, "V000002");
                return;
            }

            thread::sleep(Duration::from_millis(20));
        }

        panic!("searchd did not refresh to v000002");
    }

    #[tokio::test]
    async fn http_source_search_returns_cutter_api_contract() {
        let library = prepare_library(&[
            ("V000001", "一号", "现金流第一句。", "现金流第一句"),
            ("V000002", "二号", "现金流第二句。", "现金流第二句"),
        ]);
        let router = app(Arc::new(SearchEngine::new(
            library.path().to_path_buf(),
            None,
        )));

        let response = router
            .oneshot(
                Request::builder()
                    .uri("/source-search?query=%E7%8E%B0%E9%87%91%E6%B5%81&limit=1")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let body = serde_json::from_slice::<serde_json::Value>(&bytes).unwrap();
        assert_eq!(body["schema_version"], "1.0");
        assert_eq!(body["data"]["search_mode"], "searchd");
        assert_eq!(body["data"]["returned_count"], 1);
        assert_eq!(body["data"]["has_more"], true);
        assert_eq!(body["data"]["next_cursor"], "searchd:1");
        assert_eq!(
            body["data"]["groups"][0]["hit_segments"][0]["match_type"],
            "exact"
        );
    }

    #[tokio::test]
    async fn http_source_video_detail_returns_cutter_transcript_contract() {
        let library = prepare_library(&[("V000001", "一号", "现金流第一句。", "现金流第一句")]);
        let router = app(Arc::new(SearchEngine::new(
            library.path().to_path_buf(),
            None,
        )));

        let response = router
            .oneshot(
                Request::builder()
                    .uri("/source-videos/V000001/detail")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let body = serde_json::from_slice::<serde_json::Value>(&bytes).unwrap();
        assert_eq!(body["schema_version"], "1.0");
        assert_eq!(body["data"]["source_video_id"], "V000001");
        assert_eq!(body["data"]["transcript"]["provider"], "sqlite-index");
        assert_eq!(body["data"]["transcript"]["full_text"], "现金流第一句。");
        assert_eq!(
            body["data"]["transcript"]["segments"][0]["segment_id"],
            "V000001-S000001"
        );
    }

    fn prepare_library(videos: &[(&str, &str, &str, &str)]) -> TempDir {
        let expanded = videos
            .iter()
            .map(|(source_video_id, title, text, normalized_text)| {
                (*source_video_id, *title, vec![(*text, *normalized_text)])
            })
            .collect::<Vec<_>>();

        prepare_library_with_segments(&expanded)
    }

    fn prepare_library_with_segments(videos: &[(&str, &str, Vec<(&str, &str)>)]) -> TempDir {
        let library = TempDir::new().unwrap();

        write_index_package(library.path(), "v000001", videos);

        library
    }

    fn write_index_package(
        library_root: &Path,
        index_version: &str,
        videos: &[(&str, &str, Vec<(&str, &str)>)],
    ) {
        let index_root = library_root
            .join(".mixlab-library")
            .join("indexes")
            .join("source-transcript-index");
        let package_root = index_root.join(index_version);
        fs::create_dir_all(&package_root).unwrap();
        fs::write(
            index_root.join("current.json"),
            format!(
                r#"{{"library_id":"lib_main_001","current_version":"{index_version}","updated_at":"2026-06-02T00:00:00Z"}}"#
            ),
        )
        .unwrap();

        let connection = Connection::open(package_root.join("index.sqlite")).unwrap();
        connection
            .execute_batch(
                "\
                CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE source_videos (
                  position INTEGER NOT NULL,
                  source_video_id TEXT PRIMARY KEY,
                  title TEXT NOT NULL,
                  duration_ms INTEGER NOT NULL,
                  relative_path TEXT NOT NULL,
                  cover_path TEXT NOT NULL
                );
                CREATE TABLE segments (
                  source_video_id TEXT NOT NULL,
                  segment_id TEXT PRIMARY KEY,
                  segment_index INTEGER NOT NULL,
                  begin_ms INTEGER NOT NULL,
                  end_ms INTEGER NOT NULL,
                  text TEXT NOT NULL,
                  normalized_text TEXT NOT NULL
                );\
                ",
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO metadata (key, value) VALUES ('index_version', ?1)",
                [index_version],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO metadata (key, value) VALUES ('source_video_count', ?1)",
                [videos.len().to_string()],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO metadata (key, value) VALUES ('segment_count', ?1)",
                [videos
                    .iter()
                    .map(|(_source_video_id, _title, segments)| segments.len())
                    .sum::<usize>()
                    .to_string()],
            )
            .unwrap();

        for (index, (source_video_id, title, segments)) in videos.iter().enumerate() {
            connection
                .execute(
                    "INSERT INTO source_videos
                      (position, source_video_id, title, duration_ms, relative_path, cover_path)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        index as i64,
                        source_video_id,
                        title,
                        (segments.len() as i64).max(1) * 4_000_i64,
                        format!("source-videos/{source_video_id}.mp4"),
                        format!(".mixlab-library/videos/{source_video_id}/cover.jpg"),
                    ],
                )
                .unwrap();
            for (segment_index, (text, normalized_text)) in segments.iter().enumerate() {
                connection
                    .execute(
                        "INSERT INTO segments
                          (source_video_id, segment_id, segment_index, begin_ms, end_ms, text, normalized_text)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                        params![
                            source_video_id,
                            format!("{source_video_id}-S{:06}", segment_index + 1),
                            segment_index as i64,
                            segment_index as i64 * 4_000_i64,
                            (segment_index as i64 + 1_i64) * 4_000_i64,
                            text,
                            normalized_text,
                        ],
                    )
                    .unwrap();
            }
        }
    }
}
