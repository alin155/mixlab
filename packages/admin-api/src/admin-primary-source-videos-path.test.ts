import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminPrimarySourceVideosPathReader,
  readAdminPrimarySourceVideosPath,
  selectAdminPrimarySourceVideosPath
} from "./admin-primary-source-videos-path.ts";

test("primary source-videos path selects the first enabled source folder", () => {
  assert.equal(
    selectAdminPrimarySourceVideosPath({
      settings: {
        source_folders: [
          { path: "/library/source-videos", enabled: false },
          { path: "/Volumes/MixLab/PublicLibrary/source-videos", enabled: true },
          { path: "/archive/source-videos", enabled: true }
        ]
      },
      fallback_source_videos_root: "/fallback/source-videos"
    }),
    "/Volumes/MixLab/PublicLibrary/source-videos"
  );
});

test("primary source-videos path falls back to the first configured source folder", () => {
  assert.equal(
    selectAdminPrimarySourceVideosPath({
      settings: {
        source_folders: [
          { path: "/library/source-videos", enabled: false },
          { path: "/archive/source-videos", enabled: false }
        ]
      },
      fallback_source_videos_root: "/fallback/source-videos"
    }),
    "/library/source-videos"
  );
});

test("primary source-videos path falls back to the library layout root when settings are empty", async () => {
  const selected = await readAdminPrimarySourceVideosPath({
    library_root: "/library",
    deps: {
      async read_settings(libraryRoot) {
        assert.equal(libraryRoot, "/library");
        return {
          source_folders: []
        };
      },
      source_videos_root(libraryRoot) {
        assert.equal(libraryRoot, "/library");
        return "/library/source-videos";
      }
    }
  });

  assert.equal(selected, "/library/source-videos");
});

test("primary source-videos path reader injects settings and layout dependencies", async () => {
  const readPrimarySourceVideosPath = createAdminPrimarySourceVideosPathReader({
    async read_settings(libraryRoot) {
      assert.equal(libraryRoot, "/library");
      return {
        source_folders: [
          { path: "/library/source-videos", enabled: false },
          { path: "/library/nas-source-videos", enabled: true }
        ]
      };
    },
    source_videos_root(libraryRoot) {
      assert.equal(libraryRoot, "/library");
      return "/library/source-videos";
    }
  });

  assert.equal(await readPrimarySourceVideosPath("/library"), "/library/nas-source-videos");
});
