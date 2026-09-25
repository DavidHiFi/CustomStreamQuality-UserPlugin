/* eslint-disable simple-header/header -- Independently written MIT plugin. */
/* Copyright (c) 2026 DavidHiFi. SPDX-License-Identifier: MIT */

export interface QualitySettings {
    fpsEnabled: boolean;
    fps: number;
    resolutionEnabled: boolean;
    resolution: number;
    resolutionWidth: string;
    resolutionHeight: string;
    bitrateEnabled: boolean;
    bitrate: number;
    codecEnabled: boolean;
    videoCodec: string;
    keyframeIntervalEnabled: boolean;
    keyframeInterval: number;
    hdrEnabled: boolean;
    spoofBadgeEnabled: boolean;
    spoofBadgeResolution: number;
    spoofBadgeWidth: string;
    spoofBadgeHeight: string;
    spoofBadgeFps: number;
}

type Data = Record<string, any>;

const heights = new Map([
    [32, 56], [144, 256], [240, 426], [360, 640], [480, 854],
    [720, 1280], [1080, 1920], [1440, 2560], [2160, 3840], [4320, 7680]
]);

function dimension(value: string, fallback: number): number {
    const n = Number(value);
    return Number.isSafeInteger(n) && n > 0 && n <= 16384 ? n : fallback;
}

export function resolution(choice: number, width: string, height: string) {
    if (choice === 0) return { width: dimension(width, 1920), height: dimension(height, 1080) };
    return { width: heights.get(choice) ?? 1920, height: heights.has(choice) ? choice : 1080 };
}

export function patchStreamParameter(parameter: unknown, settings: QualitySettings): void {
    if (!parameter || typeof parameter !== "object") return;
    if (Array.isArray(parameter)) {
        parameter.forEach(p => patchStreamParameter(p, settings));
        return;
    }

    const p = parameter as Data;
    const advertised = settings.spoofBadgeEnabled;
    if (advertised || settings.fpsEnabled) p.maxFrameRate = advertised ? settings.spoofBadgeFps : settings.fps;
    if (advertised || settings.resolutionEnabled) {
        const size = advertised
            ? resolution(settings.spoofBadgeResolution, settings.spoofBadgeWidth, settings.spoofBadgeHeight)
            : resolution(settings.resolution, settings.resolutionWidth, settings.resolutionHeight);
        p.maxResolution = { type: "fixed", ...size };
        p.maxPixelCount = size.width * size.height;
    }
    if (settings.bitrateEnabled) p.maxBitrate = settings.bitrate * 1000;
}

export function patchTransport(options: Data, settings: QualitySettings, codec?: Data): void {
    if (settings.resolutionEnabled) {
        const size = resolution(settings.resolution, settings.resolutionWidth, settings.resolutionHeight);
        options.encodingVideoWidth = size.width;
        options.encodingVideoHeight = size.height;
        options.remoteSinkWantsPixelCount = size.width * size.height;
    }
    if (settings.fpsEnabled) {
        options.encodingVideoFrameRate = settings.fps;
        options.remoteSinkWantsMaxFramerate = settings.fps;
        options.captureVideoFrameRate = settings.fps;
    }
    if (settings.bitrateEnabled) {
        const bps = settings.bitrate * 1000;
        options.encodingVideoBitRate = bps;
        options.encodingVideoMinBitRate = bps;
        options.encodingVideoMaxBitRate = bps;
    }
    if (settings.keyframeIntervalEnabled) options.keyframeInterval = settings.keyframeInterval;
    if (settings.codecEnabled && codec) options.videoEncoder = codec;
    if (options.streamParameters) patchStreamParameter(options.streamParameters, settings);
}

export function patchDesktopSource(options: Data, settings: QualitySettings): void {
    if (settings.hdrEnabled) options.hdrCaptureMode = "always";
    if (settings.fpsEnabled) options.framerate = settings.fps;
    if (settings.resolutionEnabled) {
        const size = resolution(settings.resolution, settings.resolutionWidth, settings.resolutionHeight);
        options.width = size.width;
        options.height = size.height;
        options.resolution = size.height;
    }
}

export function patchQuality(quality: Data, settings: QualitySettings): void {
    if (!quality || typeof quality !== "object") return;
    const size = settings.resolutionEnabled
        ? resolution(settings.resolution, settings.resolutionWidth, settings.resolutionHeight)
        : null;
    for (const part of [quality.capture, quality.encode]) {
        if (!part || typeof part !== "object") continue;
        if (size) {
            part.width = size.width;
            part.height = size.height;
            part.pixelCount = size.width * size.height;
        }
        if (settings.fpsEnabled) part.framerate = settings.fps;
    }
    if (size && !(quality.capture || quality.encode)) {
        quality.width = size.width;
        quality.height = size.height;
    }
    if (settings.fpsEnabled && !(quality.capture || quality.encode)) quality.framerate = settings.fps;
    if (settings.bitrateEnabled) {
        quality.bitrateMin = settings.bitrate * 1000;
        quality.bitrateMax = settings.bitrate * 1000;
        quality.bitrateTarget = settings.bitrate * 1000;
    }
}
