import assert from "node:assert/strict";
import test from "node:test";
import { unifyPortraits } from "./presentation.ts";
import { captionsToAss } from "./media.ts";
import { DEFAULT_OUTPUT, type Composition } from "./types.ts";

const measured = (height: number, aspect = 16 / 9): Composition => ({ usable: true, reason: "", multiple_faces: false, source_aspect: aspect,
  points: [0, 1000, 2000].map(at_ms => ({ at_ms, x: 0.5, y: 0.4, height, confidence: 0.95 })) });
test("portrait shots share a feasible face size without stretching or unlimited zoom", () => {
  const shots = [measured(0.12), measured(0.24), measured(0.18, 9 / 16)];
  unifyPortraits(shots, DEFAULT_OUTPUT);
  assert.ok(shots.every(shot => Math.abs(shot.target_face_ratio! - 0.24) < 0.001));
  for (const shot of shots) {
    assert.ok(Math.abs(shot.points[0]!.height! / shot.crop_height! - 0.24) < 0.001);
    assert.ok(shot.crop_height! <= Math.min(1, shot.source_aspect! / (9 / 16)));
  }
  assert.throws(() => unifyPortraits([measured(0.03), measured(0.4)], DEFAULT_OUTPUT), /远近差异过大/);
  assert.throws(() => unifyPortraits([{ ...measured(0.2), usable: false, reason: "多人主体存在歧义" }], DEFAULT_OUTPUT), /多人主体/);
  const close = [measured(0.1), measured(0.2)];
  unifyPortraits(close, { ...DEFAULT_OUTPUT, shot_size: "close" });
  assert.ok(close.every(item => Math.abs(item.target_face_ratio! - 0.3) < 0.001));
});
test("subtitle presets retain legacy positioning and escape source ASS markup", () => {
  const captions = [{ begin_ms: 0, end_ms: 1700, text: "原声{\\pos(1,2)}字幕" }];
  const legacy = captionsToAss(captions, { ...DEFAULT_OUTPUT, subtitle_template: undefined, subtitle_style: "white", subtitle_margin: undefined }, "Noto Sans SC");
  assert.ok(legacy.includes(",60,60,100,1"));
  assert.ok(!legacy.includes("{\\pos"));
  const styled = captionsToAss(captions, { ...DEFAULT_OUTPUT, subtitle_template: undefined, subtitle_style: "pop", subtitle_margin: 0.2 }, "Noto Sans SC");
  assert.ok(styled.includes(",60,60,384,1"));
  assert.ok(styled.includes("\\t(0,120,"));
  assert.ok(styled.includes("0:00:01.70"));
});
