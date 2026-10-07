"""Local media analysis and embedding worker. JSON lines in/out; no network or credentials."""
import hashlib
import json
import os
import sqlite3
import sys
from pathlib import Path
from urllib.parse import quote

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

MODELS = Path(sys.argv[1])
encoder = None
tokenizer = None
model_stamp = None


def emit(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)


def load_encoder():
    global encoder, tokenizer, model_stamp
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


def build_index(request):
    load_encoder()
    cache = vector_database(request)
    stamp = cache.execute("SELECT value FROM meta WHERE key='model'").fetchone()
    if stamp and stamp[0] != model_stamp:
        cache.execute("DELETE FROM vectors")
        cache.execute("DELETE FROM meta")
    cache.execute("INSERT OR REPLACE INTO meta VALUES('model',?)", (model_stamp,))
    cache.commit()
    uri = "file:" + quote(Path(request["index_path"]).absolute().as_posix(), safe="/:") + "?mode=ro&immutable=1"
    source = sqlite3.connect(uri, uri=True)
    columns = {row[1] for row in source.execute("PRAGMA table_info(source_videos)")}
    folder = "v.source_folder_name" if "source_folder_name" in columns else "''"
    total = source.execute("SELECT COUNT(*) FROM segments WHERE length(text)>0").fetchone()[0]
    cursor = source.execute("SELECT s.segment_id,s.source_video_id," + folder + ",s.begin_ms,s.end_ms,s.text FROM segments s JOIN source_videos v ON v.source_video_id=s.source_video_id WHERE length(s.text)>0 ORDER BY s.rowid")
    completed = cache.execute("SELECT COUNT(*) FROM vectors").fetchone()[0]
    emit({"id": request["id"], "progress": {"done": completed, "total": total}})
    while True:
        rows = cursor.fetchmany(48)
        if not rows:
            break
        missing = [row for row in rows if not cache.execute("SELECT 1 FROM vectors WHERE segment_id=?", (row[0],)).fetchone()]
        if missing:
            values = embeddings([row[5] for row in missing])
            cache.executemany("INSERT OR REPLACE INTO vectors VALUES(?,?,?,?,?,?,?)", [tuple(row) + (vector.tobytes(),) for row, vector in zip(missing, values)])
            cache.commit()
            completed += len(missing)
            emit({"id": request["id"], "progress": {"done": completed, "total": total}})
    cache.execute("INSERT OR REPLACE INTO meta VALUES('ready','1')")
    cache.commit()
    source.close()
    cache.close()
    return {"done": completed, "total": total, "ready": True}


def search_index(request):
    import heapq
    import numpy as np
    cache = vector_database(request)
    if not cache.execute("SELECT 1 FROM meta WHERE key='ready'").fetchone():
        cache.close()
        return []
    query = embeddings([request["query"]])[0]
    stamp = cache.execute("SELECT value FROM meta WHERE key='model'").fetchone()
    if not stamp or stamp[0] != model_stamp:
        cache.close()
        raise ValueError("语义模型已更新，请重新建立本机索引")
    parameters = []
    clause = ""
    if request.get("folder"):
        clause = " WHERE folder=?"
        parameters = [request["folder"]]
    cursor = cache.execute("SELECT source_id,segment_id,begin_ms,end_ms,text,vector FROM vectors" + clause, parameters)
    ranked = []
    serial = 0
    while True:
        rows = cursor.fetchmany(512)
        if not rows:
            break
        matrix = np.vstack([np.frombuffer(row[5], dtype=np.float32) for row in rows])
        scores = matrix @ query
        for row, score in zip(rows, scores):
            if float(score) < 0.62:
                continue
            serial += 1
            item = (float(score), serial, row[:5])
            if len(ranked) < 12:
                heapq.heappush(ranked, item)
            elif item[0] > ranked[0][0]:
                heapq.heapreplace(ranked, item)
    cache.close()
    return [{"source_video_id": row[0], "segment_id": row[1], "begin_ms": row[2], "end_ms": row[3], "text": row[4], "score": score} for score, _, row in sorted(ranked, reverse=True)]


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
    for frame in request["frames"]:
        image = cv2.imdecode(np.fromfile(frame["file_path"], dtype=np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            continue
        height, width = image.shape[:2]
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
        points.append({"at_ms": frame["at_ms"], "x": x, "y": y, "confidence": float(face[-1])})
    coverage = len(points) / max(1, len(request["frames"]))
    usable = not ambiguous and not unsafe_crop and not sudden_motion and coverage >= 0.6
    reason = "" if usable else "多人主体存在歧义，请选择全景或手动构图" if ambiguous else "近景或镜头变化无法安全裁切，请选择全景或手动构图" if unsafe_crop or sudden_motion else "未稳定检测到主讲人，请选择全景或手动构图"
    return {"usable": usable, "reason": reason, "points": points, "multiple_faces": ambiguous}


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
        elif operation == "semantic_search":
            result = search_index(request)
        elif operation == "faces":
            result = faces(request)
        else:
            raise ValueError("unsupported operation")
        emit({"id": request["id"], "result": result})
    except Exception as error:
        emit({"id": request.get("id") if request else None, "error": str(error)[:800]})
