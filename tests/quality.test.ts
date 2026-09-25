import assert from "node:assert/strict";
import { test } from "node:test";

import { patchDesktopSource, patchQuality, patchStreamParameter, patchTransport, QualitySettings } from "../src/quality";

const base: QualitySettings = {
    fpsEnabled: true, fps: 60,
    resolutionEnabled: true, resolution: 1080, resolutionWidth: "1920", resolutionHeight: "1080",
    bitrateEnabled: true, bitrate: 5000,
    codecEnabled: false, videoCodec: "H264",
    keyframeIntervalEnabled: false, keyframeInterval: 0,
    hdrEnabled: false,
    spoofBadgeEnabled: true, spoofBadgeResolution: 4320,
    spoofBadgeWidth: "7680", spoofBadgeHeight: "4320", spoofBadgeFps: 360
};

test("8K 360 badge stays separate from 1080p 60 encoding", () => {
    const options: Record<string, any> = { streamParameters: [{ rid: "100", maxFrameRate: 60 }] };
    patchTransport(options, base);
    assert.equal(options.encodingVideoWidth, 1920);
    assert.equal(options.encodingVideoHeight, 1080);
    assert.equal(options.encodingVideoFrameRate, 60);
    assert.deepEqual(options.streamParameters[0].maxResolution, { type: "fixed", width: 7680, height: 4320 });
    assert.equal(options.streamParameters[0].maxFrameRate, 360);
    assert.equal(options.streamParameters[0].maxPixelCount, 7680 * 4320);
});

test("standalone stream parameters get the advertised values", () => {
    const params = [{ maxFrameRate: 60 }, { maxFrameRate: 30 }];
    patchStreamParameter(params, base);
    assert.deepEqual(params.map(p => p.maxFrameRate), [360, 360]);
});

test("disabled options retain Discord values", () => {
    const s = { ...base, fpsEnabled: false, resolutionEnabled: false, bitrateEnabled: false, spoofBadgeEnabled: false };
    const options: Record<string, any> = { encodingVideoFrameRate: 30, encodingVideoBitRate: 700000, streamParameters: { maxFrameRate: 30 } };
    patchTransport(options, s);
    assert.equal(options.encodingVideoFrameRate, 30);
    assert.equal(options.encodingVideoBitRate, 700000);
    assert.equal(options.streamParameters.maxFrameRate, 30);
});

test("codec, keyframe, HDR and custom size only change when enabled", () => {
    const s = { ...base, resolution: 0, resolutionWidth: "2560", resolutionHeight: "1440", codecEnabled: true, keyframeIntervalEnabled: true, keyframeInterval: 2000, hdrEnabled: true };
    const options: Record<string, any> = {};
    const source: Record<string, any> = {};
    patchTransport(options, s, { codec: "AV1" });
    patchDesktopSource(source, s);
    assert.equal(options.encodingVideoWidth, 2560);
    assert.equal(options.keyframeInterval, 2000);
    assert.deepEqual(options.videoEncoder, { codec: "AV1" });
    assert.equal(source.hdrCaptureMode, "always");
    assert.equal(source.height, 1440);
});

test("nested quality updates only the actual capture and encoder", () => {
    const quality: Record<string, any> = { capture: { width: 1 }, encode: { width: 1 }, bitrateTarget: 1 };
    patchQuality(quality, base);
    assert.equal(quality.capture.width, 1920);
    assert.equal(quality.encode.height, 1080);
    assert.equal(quality.encode.framerate, 60);
    assert.equal(quality.bitrateTarget, 5000000);
});
