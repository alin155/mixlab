"""Local media analysis and embedding worker. JSON lines in/out; no network or credentials."""
import hashlib
import json
import os
import sqlite3
import sys
import time
import unicodedata
import uuid
from pathlib import Path
from urllib.parse import quote
from contextlib import closing

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

MODELS = Path(sys.argv[1])
encoder = None
tokenizer = None
model_stamp = None
encoder_stamp = None
tokenizer_stamp = None
loaded_ann = None


def emit(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)


def load_encoder():
    global encoder, tokenizer, model_stamp, encoder_stamp, tokenizer_stamp
    if encoder is not None:
        return
    import onnxruntime as ort
    from tokenizers import Tokenizer
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    model = MODELS / "bge-small-zh.onnx"
    encoder = ort.InferenceSession(str(model), sess_options=options, providers=["CPUExecutionProvider"])
    tokenizer = Tokenizer.from_file(str(MODELS / "tokenizer.json"))
    tokenizer.enable_truncation(max_length=256)
    tokenizer.enable_padding(pad_id=0, pad_token="[PAD]")
    model_stamp = hashlib.sha256(model.read_bytes()).hexdigest()
    tokenizer_stamp = hashlib.sha256((MODELS / "tokenizer.json").read_bytes()).hexdigest()
    encoder_stamp = hashlib.sha256((model_stamp + tokenizer_stamp + "cls-l2-f32-v1").encode()).hexdigest()


def embeddings(texts):
    import numpy as np
    load_encoder()
    encoded = tokenizer.encode_batch(texts)
    ids = np.asarray([value.ids for value in encoded], dtype=np.int64)
    mask = np.asarray([value.attention_mask for value in encoded], dtype=np.int64)
    types = np.asarray([value.type_ids for value in encoded], dtype=np.int64)
    available = {"input_ids": ids, "attention_mask": mask, "token_type_ids": types}
    inputs = {value.name: available[value.name] for value in encoder.get_inputs()}
    vectors = encoder.run(None, inputs)[0]
    if vectors.ndim == 3:
        vectors = vectors[:, 0, :]
    vectors = vectors.astype(np.float32)
    return vectors / np.maximum(np.linalg.norm(vectors, axis=1, keepdims=True), 1e-8)


def vector_database(request):
    cache = Path(request["cache_path"])
    cache.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(cache)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT)")
    db.execute("CREATE TABLE IF NOT EXISTS vectors(segment_id TEXT PRIMARY KEY, source_id TEXT, folder TEXT, begin_ms INTEGER, end_ms INTEGER, text TEXT, vector BLOB)")
    return db


def readonly(file):
    return sqlite3.connect("file:" + quote(Path(file).absolute().as_posix(), safe="/:") + "?mode=ro", uri=True)


def embedding_store(request):
    root = Path(request["embedding_cache_root"])
    root.mkdir(parents=True, exist_ok=True)
    store = sqlite3.connect(root / (encoder_stamp + ".sqlite"), timeout=5)
    store.execute("PRAGMA journal_mode=WAL")
    store.execute("CREATE TABLE IF NOT EXISTS embeddings(key TEXT PRIMARY KEY, vector BLOB NOT NULL)")
    return store


def compatible(meta):
    if meta.get("encoder"):
        return meta["encoder"] == encoder_stamp
    # The deployed legacy worker used this exact pinned model/tokenizer pair.
    return meta.get("model") == model_stamp == "15b717c382bcb518ba457b93ea6850ede7f4f1cd8937454aa06972366cd19bcc" and tokenizer_stamp == "48cea5d44424912a6fd1ea647bf4fe50b55ab8b1e5879c3275f80e339e8fae26"


def legacy_stores(request):
    stores = []
    for file in request.get("legacy_cache_paths", []):
        db = readonly(file)
        if compatible(dict(db.execute("SELECT key,value FROM meta"))):
            stores.append(db)
        else:
            db.close()
    return stores


def cached_embeddings(rows, store, legacy):
    import numpy as np
    keys = [hashlib.sha256(row[5].encode()).hexdigest() for row in rows]
    unique = dict(zip(keys, rows))
    placeholders = ",".join("?" for _ in unique)
    found = dict(store.execute("SELECT key,vector FROM embeddings WHERE key IN (" + placeholders + ")", tuple(unique)))
    missing = {row[1]: key for key, row in unique.items() if key not in found}
    if missing:
        placeholders = ",".join("?" for _ in missing)
        for db in legacy:
            for segment_id, text, vector in db.execute("SELECT segment_id,text,vector FROM vectors WHERE segment_id IN (" + placeholders + ")", tuple(missing)):
                key = missing[segment_id]
                if unique[key][5] == text:
                    found[key] = vector
    new = [key for key in unique if key not in found]
    for offset in range(0, len(new), 48):
        batch = new[offset:offset + 48]
        for key, vector in zip(batch, embeddings([unique[key][5] for key in batch])):
            found[key] = vector.tobytes()
    store.executemany("INSERT OR IGNORE INTO embeddings VALUES(?,?)", found.items())
    store.commit()
    return np.vstack([np.frombuffer(found[key], dtype=np.float32) for key in keys]), len(new), len(keys) - len(new)


def build_ann(request, cache, total):
    import numpy as np
    from usearch.index import Index
    folder_indices = {}
    done = 0
    cursor = cache.execute("SELECT rowid,folder,vector FROM vectors ORDER BY rowid")
    while True:
        rows = cursor.fetchmany(512)
        if not rows:
            break
        for folder in {row[1] for row in rows}:
            subset = [row for row in rows if row[1] == folder]
            matrix = np.vstack([np.frombuffer(row[2], dtype=np.float32) for row in subset])
            if folder not in folder_indices:
                folder_indices[folder] = Index(ndim=matrix.shape[1], metric="cos", dtype="f16", connectivity=16, expansion_add=96, expansion_search=96)
            index = folder_indices[folder]
            index.add(np.asarray([row[0] for row in subset], dtype=np.uint64), matrix, threads=2)
        done += len(rows)
        emit({"id": request["id"], "progress": {"done": done, "total": total, "phase": "ann"}})
    generation = uuid.uuid4().hex
    directory = Path(request["cache_path"]).parent / "semantic-ann" / generation
    directory.mkdir(parents=True)
    files = {}
    for folder, index in folder_indices.items():
        file = directory / (hashlib.sha256(folder.encode()).hexdigest() + ".usearch")
        index.save(str(file))
        files[folder] = str(file.relative_to(directory.parent.parent))
    cache.execute("INSERT OR REPLACE INTO meta VALUES('ann',?)", (json.dumps({"encoder": encoder_stamp, "generation": generation, "files": files}),))


def build_index(request):
    load_encoder()
    cache = vector_database(request)
    meta = dict(cache.execute("SELECT key,value FROM meta"))
    if meta and not compatible(meta):
        cache.execute("DELETE FROM vectors")
        cache.execute("DELETE FROM meta")
    cache.execute("INSERT OR REPLACE INTO meta VALUES('model',?)", (model_stamp,))
    cache.execute("INSERT OR REPLACE INTO meta VALUES('encoder',?)", (encoder_stamp,))
    cache.execute("DELETE FROM meta WHERE key='ready'")
    cache.commit()
    uri = "file:" + quote(Path(request["index_path"]).absolute().as_posix(), safe="/:") + "?mode=ro&immutable=1"
    source = sqlite3.connect(uri, uri=True)
    columns = {row[1] for row in source.execute("PRAGMA table_info(source_videos)")}
    folder = "v.source_folder_name" if "source_folder_name" in columns else "''"
    total = source.execute("SELECT COUNT(*) FROM segments WHERE length(text)>0").fetchone()[0]
    cursor = source.execute("SELECT s.segment_id,s.source_video_id," + folder + ",s.begin_ms,s.end_ms,s.text FROM segments s JOIN source_videos v ON v.source_video_id=s.source_video_id WHERE length(s.text)>0 ORDER BY s.rowid")
    completed = cache.execute("SELECT COUNT(*) FROM vectors").fetchone()[0]
    store = embedding_store(request)
    legacy = legacy_stores(request)
    encoded, reused = 0, 0
    emit({"id": request["id"], "progress": {"done": completed, "total": total}})
    while True:
        rows = cursor.fetchmany(48)
        if not rows:
            break
        # Cache keys use original text plus encoder identity, not the publication version.
        canonical = [(row[1], row[0], row[2], row[3], row[4], row[5]) for row in rows]
        values, added, reused_batch = cached_embeddings(canonical, store, legacy)
        encoded += added
        reused += reused_batch
        missing = []
        for row, vector in zip(rows, values):
            saved = cache.execute("SELECT source_id,folder,begin_ms,end_ms,text FROM vectors WHERE segment_id=?", (row[0],)).fetchone()
            if saved != tuple(row[1:]):
                missing.append((row, vector))
                if saved is None:
                    completed += 1
        if missing:
            cache.executemany("INSERT OR REPLACE INTO vectors VALUES(?,?,?,?,?,?,?)", [tuple(row) + (vector.tobytes(),) for row, vector in missing])
            cache.commit()
            emit({"id": request["id"], "progress": {"done": completed, "total": total, "encoded": encoded, "reused": reused, "phase": "vectors"}})
    build_ann(request, cache, total)
    cache.execute("INSERT OR REPLACE INTO meta VALUES('ready','1')")
    cache.commit()
    source.close()
    cache.close()
    store.close()
    for db in legacy:
        db.close()
    return {"done": completed, "total": total, "ready": True, "encoded": encoded, "reused": reused, "phase": "ready"}


def grams(text):
    normalized = "".join(c for c in unicodedata.normalize("NFKC", text).lower() if c.isalnum())
    return set(normalized[i:i + 2] for i in range(len(normalized) - 1))


def lexical_candidates(request, source):
    query_grams = sorted(grams(request["query"]))
    if not query_grams:
        return []
    # Probe bounded postings, then prefer discriminating terms without counting the whole corpus.
    frequencies = []
    for gram in query_grams[:96]:
        sample = source.execute("SELECT segment_id FROM segment_ngrams WHERE gram=? LIMIT 257", (gram,)).fetchall()
        if sample:
            frequencies.append((len(sample), gram))
    ids = set()
    for _, gram in sorted(frequencies)[:8]:
        rows = source.execute("SELECT g.segment_id FROM segment_ngrams g JOIN source_videos v ON v.source_video_id=g.source_video_id WHERE g.gram=?" + (" AND v.source_folder_name=?" if request.get("folder") else "") + " LIMIT 256", (gram, request["folder"]) if request.get("folder") else (gram,))
        ids.update(row[0] for row in rows)
    candidates = []
    ids = sorted(ids)
    query_set = set(query_grams)
    for offset in range(0, len(ids), 256):
        batch = ids[offset:offset + 256]
        for row in source.execute("SELECT s.source_video_id,s.segment_id,v.source_folder_name,s.begin_ms,s.end_ms,s.text,s.segment_index FROM segments s JOIN source_videos v ON v.source_video_id=s.source_video_id WHERE s.segment_id IN (" + ",".join("?" for _ in batch) + ")", batch):
            overlap = len(query_set & grams(row[5]))
            candidates.append((overlap / max(1, len(grams(row[5]))) ** 0.5, row))
    ranked = sorted(candidates, key=lambda item: (-item[0], item[1][1]))[:64]
    output = {}
    for _, row in ranked:
        output[(row[1],)] = (row[:6], [row[1]])
        if len(request["query"]) > len(row[5]) * 1.2:
            neighbors = source.execute("SELECT segment_id,begin_ms,end_ms,text FROM segments WHERE source_video_id=? AND segment_index BETWEEN ? AND ? ORDER BY segment_index", (row[0], max(0, row[6] - 1), row[6] + 2)).fetchall()
            if neighbors and neighbors[-1][2] - neighbors[0][1] <= 120000:
                segment_ids = [item[0] for item in neighbors]
                output[tuple(segment_ids)] = ((row[0], row[1], row[2], neighbors[0][1], neighbors[-1][2], "".join(item[3] for item in neighbors)), segment_ids)
    return list(output.values())[:128]


def ann_candidates(request, query):
    global loaded_ann
    from usearch.index import Index
    file = Path(request["cache_path"])
    if not file.is_file():
        return None
    with closing(readonly(file)) as cache:
        meta = dict(cache.execute("SELECT key,value FROM meta"))
        if not compatible(meta) or meta.get("ready") != "1" or not meta.get("ann"):
            return None
        manifest = json.loads(meta["ann"])
        if manifest["encoder"] != encoder_stamp:
            return None
        stamp = (str(file), manifest["generation"])
        if loaded_ann is None or loaded_ann[0] != stamp:
            loaded_ann = (stamp, {})
        keys = set()
        for folder, relative in manifest["files"].items():
            if request.get("folder") and folder != request["folder"]:
                continue
            if not (file.parent / relative).is_file():
                return None
            if folder not in loaded_ann[1]:
                loaded_ann[1][folder] = Index.restore(str(file.parent / relative), view=False)
            index = loaded_ann[1][folder]
            keys.update(int(key) for key in index.search(query, min(64, len(index)), threads=1).keys)
        if not keys:
            return []
        rows = cache.execute("SELECT source_id,segment_id,folder,begin_ms,end_ms,text,vector FROM vectors WHERE rowid IN (" + ",".join("?" for _ in keys) + ")", tuple(keys)).fetchall()
        return rows


def hybrid_search(request):
    import numpy as np
    started = time.monotonic()
    load_encoder()
    store = embedding_store(request)
    legacy = legacy_stores(request)
    query_rows = [("", "query", "", 0, 0, request["query"])]
    query_matrix, encoded, reused = cached_embeddings(query_rows, store, [])
    query = query_matrix[0]
    indexed = ann_candidates(request, query)
    complete = indexed is not None
    if complete:
        candidates = [(row[:6], [row[1]]) for row in indexed]
        matrix = np.vstack([np.frombuffer(row[6], dtype=np.float32) for row in indexed]) if indexed else None
    else:
        with closing(readonly(request["index_path"])) as source:
            deadline = time.monotonic() + 4
            source.set_progress_handler(lambda: int(time.monotonic() > deadline), 10000)
            try:
                candidates = lexical_candidates(request, source)
            except sqlite3.OperationalError as error:
                if "interrupted" not in str(error):
                    raise
                candidates = []
        matrix = None
        if candidates:
            matrix, added, reused_batch = cached_embeddings([row for row, _ in candidates], store, legacy)
            encoded += added
            reused += reused_batch
    ranked = []
    if matrix is not None:
        for (row, ids), score in zip(candidates, matrix @ query):
            if float(score) >= 0.62:
                ranked.append({"source_video_id": row[0], "segment_id": row[1], "segment_ids": ids, "begin_ms": row[3], "end_ms": row[4], "text": row[5], "score": float(score)})
    ranked.sort(key=lambda item: (-item["score"], item["segment_id"]))
    store.close()
    for db in legacy:
        db.close()
    return {"hits": ranked[:12], "mode": "ann" if complete else "candidate", "complete": complete, "examined": len(candidates), "query_ms": round((time.monotonic() - started) * 1000), "encoded": encoded, "reused": reused}


def orientation(request):
    import cv2
    import numpy as np
    cv2.setNumThreads(1)
    detector = cv2.FaceDetectorYN.create(str(MODELS / "yunet.onnx"), "", (640, 360), 0.85, 0.3, 5000)
    upright = cv2.CascadeClassifier(str(Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml"))
    if upright.empty():
        raise ValueError("upright face classifier is missing")
    scores = []
    for angle in [0, 90, 180, 270]:
        confidences = []
        ambiguous = False
        for frame in request["frames"]:
            image = cv2.imdecode(np.fromfile(frame["file_path"], dtype=np.uint8), cv2.IMREAD_COLOR)
            if image is None:
                continue
            if angle:
                image = cv2.rotate(image, {90: cv2.ROTATE_90_CLOCKWISE, 180: cv2.ROTATE_180, 270: cv2.ROTATE_90_COUNTERCLOCKWISE}[angle])
            height, width = image.shape[:2]
            detector.setInputSize((width, height))
            _, detected = detector.detect(image)
            if detected is None:
                continue
            ordered = sorted(detected, key=lambda f: float(f[2] * f[3]), reverse=True)
            if len(ordered) > 1 and ordered[1][2] * ordered[1][3] >= ordered[0][2] * ordered[0][3] * 0.35:
                ambiguous = True
                continue
            face = ordered[0]
            confirmed = False
            for x, y, w, h in upright.detectMultiScale(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), 1.1, 5, minSize=(30, 30)):
                overlap = max(0, min(float(face[0] + face[2]), x + w) - max(float(face[0]), x)) * max(0, min(float(face[1] + face[3]), y + h) - max(float(face[1]), y))
                union = float(face[2] * face[3]) + int(w) * int(h) - overlap
                confirmed |= overlap / max(1, union) >= 0.35
            if not confirmed:
                continue
            eyes = (face[4:6] + face[6:8]) / 2
            mouth = (face[10:12] + face[12:14]) / 2
            # A sideways false positive must not count as an upright face.
            if abs(float(face[5] - face[7])) > float(face[3]) * 0.15 or float(mouth[1] - eyes[1]) < float(face[3]) * 0.2:
                continue
            confidences.append(float(face[-1]))
        coverage = len(confidences) / max(1, len(request["frames"]))
        score = sum(confidences) / max(1, len(request["frames"])) if not ambiguous else 0
        scores.append({"rotation": angle, "score": score, "coverage": coverage, "ambiguous": ambiguous})
    ranked = sorted(scores, key=lambda item: item["score"], reverse=True)
    best, second = ranked[:2]
    confident = best["coverage"] >= 0.8 and best["score"] >= 0.9 and best["score"] - second["score"] >= 0.15
    return {"rotation": best["rotation"] if confident else None, "confidence": best["score"], "scores": scores,
            "detector": "yunet-landmarks+haar-v1",
            "reason": "" if confident else "原片方向缺少唯一可靠的人脸证据，请确认方向"}


def faces(request):
    import cv2
    import numpy as np
    cv2.setNumThreads(1)
    detector = cv2.FaceDetectorYN.create(str(MODELS / "yunet.onnx"), "", (640, 360), 0.8, 0.3, 5000)
    points = []
    ambiguous = False
    unsafe_crop = False
    sudden_motion = False
    last_raw_x = None
    previous_x, previous_y = None, None
    source_aspect = None
    for frame in request["frames"]:
        image = cv2.imdecode(np.fromfile(frame["file_path"], dtype=np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            continue
        height, width = image.shape[:2]
        source_aspect = width / height
        detector.setInputSize((width, height))
        _, detected = detector.detect(image)
        if detected is None or len(detected) == 0:
            continue
        ordered = sorted(detected, key=lambda face: float(face[2] * face[3]), reverse=True)
        if len(ordered) > 1 and ordered[1][2] * ordered[1][3] >= ordered[0][2] * ordered[0][3] * 0.35:
            ambiguous = True
        face = ordered[0]
        x = float((face[0] + face[2] / 2) / width)
        y = float((face[1] + face[3] / 2) / height)
        ratio = request.get("ratio", 9 / 16)
        unsafe_crop |= float(face[2]) * 1.25 > min(width, height * ratio)
        unsafe_crop |= float(face[3]) * 1.6 > min(height, width / ratio)
        if last_raw_x is not None and abs(last_raw_x - x) > 0.18:
            sudden_motion = True
        last_raw_x = x
        if previous_x is not None:
            x = previous_x * 0.35 + x * 0.65
            y = previous_y * 0.35 + y * 0.65
        previous_x, previous_y = x, y
        points.append({"at_ms": frame["at_ms"], "x": x, "y": y, "width": float(face[2] / width), "height": float(face[3] / height), "confidence": float(face[-1])})
    coverage = len(points) / max(1, len(request["frames"]))
    usable = not ambiguous and not unsafe_crop and not sudden_motion and coverage >= 0.6
    reason = "" if usable else "多人主体存在歧义，请选择全景或手动构图" if ambiguous else "近景或镜头变化无法安全裁切，请选择全景或手动构图" if unsafe_crop or sudden_motion else "未稳定检测到主讲人，请选择全景或手动构图"
    return {"usable": usable, "reason": reason, "points": points, "multiple_faces": ambiguous, "source_aspect": source_aspect}


for raw in sys.stdin:
    request = None
    try:
        request = json.loads(raw)
        operation = request["op"]
        if operation == "ping":
            import cv2
            import onnxruntime
            import tokenizers
            result = {"ready": all((MODELS / name).is_file() for name in ["yunet.onnx", "bge-small-zh.onnx", "tokenizer.json"])}
        elif operation == "build_index":
            result = build_index(request)
        elif operation == "hybrid_search":
            result = hybrid_search(request)
        elif operation == "orientation":
            result = orientation(request)
        elif operation == "faces":
            result = faces(request)
        else:
            raise ValueError("unsupported operation")
        emit({"id": request["id"], "result": result})
    except Exception as error:
        emit({"id": request.get("id") if request else None, "error": str(error)[:800]})
