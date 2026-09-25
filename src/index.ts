/* eslint-disable simple-header/header -- Independently written MIT plugin. */
/* Copyright (c) 2026 DavidHiFi. SPDX-License-Identifier: MIT */

import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { MediaEngineStore, UserStore } from "@webpack/common";

import { patchDesktopSource, patchQuality, patchStreamParameter, patchTransport, QualitySettings } from "./quality";

const log = new Logger("CustomStreamQuality");
const resolutions = [
    { label: "32p", value: 32 }, { label: "144p", value: 144 },
    { label: "240p", value: 240 }, { label: "360p", value: 360 },
    { label: "480p", value: 480 }, { label: "720p", value: 720 },
    { label: "1080p", value: 1080 }, { label: "1440p", value: 1440 },
    { label: "4K", value: 2160 }, { label: "8K", value: 4320 },
    { label: "Custom", value: 0 }
];
const fpsMarkers = [1, 5, 10, 15, 20, 30, 60, 120, 240, 360];

const settings = definePluginSettings({
    fpsEnabled: { type: OptionType.BOOLEAN, description: "Set the encoded frame rate.", default: true, onChange: updateActiveStreams },
    fps: { type: OptionType.SLIDER, description: "Encoded frames per second.", default: 60, markers: fpsMarkers, stickToMarkers: true, onChange: updateActiveStreams },
    resolutionEnabled: { type: OptionType.BOOLEAN, description: "Set the encoded resolution.", default: true, onChange: updateActiveStreams },
    resolution: { type: OptionType.SELECT, description: "Encoded resolution.", options: resolutions.map(r => ({ ...r, default: r.value === 1080 })), onChange: updateActiveStreams },
    resolutionWidth: { type: OptionType.STRING, description: "Custom encoded width.", default: "1920", hidden: () => settings.store.resolution !== 0, onChange: updateActiveStreams },
    resolutionHeight: { type: OptionType.STRING, description: "Custom encoded height.", default: "1080", hidden: () => settings.store.resolution !== 0, onChange: updateActiveStreams },
    bitrateEnabled: { type: OptionType.BOOLEAN, description: "Set the video bitrate.", default: true, onChange: updateActiveStreams },
    bitrate: { type: OptionType.SLIDER, description: "Video bitrate in kbps.", default: 5000, markers: [500, 1000, 2500, 5000, 7500, 10000, 20000, 40000, 60000, 80000, 100000], stickToMarkers: false, onChange: updateActiveStreams },
    codecEnabled: { type: OptionType.BOOLEAN, description: "Choose a video codec.", default: false, onChange: updateActiveStreams },
    videoCodec: { type: OptionType.SELECT, description: "Video codec.", options: [{ label: "H264", value: "H264", default: true }, { label: "VP8", value: "VP8" }, { label: "VP9", value: "VP9" }, { label: "AV1", value: "AV1" }], onChange: updateActiveStreams },
    keyframeIntervalEnabled: { type: OptionType.BOOLEAN, description: "Set the keyframe interval.", default: false, onChange: updateActiveStreams },
    keyframeInterval: { type: OptionType.SLIDER, description: "Keyframe interval in milliseconds. Zero uses the encoder default.", default: 0, markers: [0, 500, 1000, 2000, 5000, 10000], stickToMarkers: true, onChange: updateActiveStreams },
    hdrEnabled: { type: OptionType.BOOLEAN, description: "Request HDR capture for new screen shares.", default: false },
    spoofBadgeEnabled: { type: OptionType.BOOLEAN, description: "Advertise a different resolution and frame rate in stream parameters.", default: false, onChange: updateActiveStreams },
    spoofBadgeResolution: { type: OptionType.SELECT, description: "Advertised resolution.", options: resolutions.map(r => ({ ...r, default: r.value === 2160 })), onChange: updateActiveStreams },
    spoofBadgeWidth: { type: OptionType.STRING, description: "Custom advertised width.", default: "3840", hidden: () => settings.store.spoofBadgeResolution !== 0, onChange: updateActiveStreams },
    spoofBadgeHeight: { type: OptionType.STRING, description: "Custom advertised height.", default: "2160", hidden: () => settings.store.spoofBadgeResolution !== 0, onChange: updateActiveStreams },
    spoofBadgeFps: { type: OptionType.SLIDER, description: "Advertised frames per second.", default: 120, markers: fpsMarkers, stickToMarkers: true, onChange: updateActiveStreams }
});

type AnyObject = Record<string, any>;
type Hook = { target: AnyObject; key: string; original: Function; wrapped: Function; };
const hooks = new Map<any, Hook[]>();
const listeners = new Map<any, { emitter: AnyObject; connected: Function; destroy: Function; }>();
let engine: AnyObject | null = null;
let connectionListener: ((connection: any) => void) | null = null;

function config(): QualitySettings {
    return settings.store as QualitySettings;
}

function codecFor(connection: AnyObject): AnyObject | undefined {
    if (!config().codecEnabled) return;
    try {
        return connection.getCodecOptions?.("", config().videoCodec, "stream")?.videoEncoder;
    } catch (error) {
        log.error("Video codec is unavailable", error);
    }
}

function installHook(connection: any, target: AnyObject, key: string, transform: (args: any[]) => void): void {
    if (typeof target?.[key] !== "function") return;
    const original = target[key];
    const wrapped = function (this: any, ...args: any[]) {
        transform(args);
        return Reflect.apply(original, this, args);
    };
    target[key] = wrapped;
    hooks.get(connection)!.push({ target, key, original, wrapped });
}

function patchConnection(connection: AnyObject): void {
    if (connection?.context !== "stream" || !connection.conn || hooks.has(connection)) return;
    const userId = UserStore.getCurrentUser()?.id;
    if (connection.streamUserId && connection.streamUserId !== userId) return;
    hooks.set(connection, []);

    installHook(connection, connection.conn, "setTransportOptions", args => {
        if (args[0] && typeof args[0] === "object") patchTransport(args[0], config(), codecFor(connection));
    });
    installHook(connection, connection.conn, "setDesktopSourceWithOptions", args => {
        if (args[0] && typeof args[0] === "object") patchDesktopSource(args[0], config());
    });
    // Discord sends these parameters on a separate path. Transport options alone
    // do not cover the viewer badge after a quality change or renegotiation.
    installHook(connection, connection.conn, "setStreamParameters", args => patchStreamParameter(args[0], config()));
    installHook(connection, connection, "setStreamParameters", args => patchStreamParameter(args[0], config()));

    const manager = connection.videoQualityManager;
    installHook(connection, manager, "setQuality", args => patchQuality(args[0], config()));
    for (const name of ["getQuality", "getDesktopQuality"]) {
        if (typeof manager?.[name] !== "function") continue;
        const original = manager[name];
        const wrapped = function (this: any, ...args: any[]) {
            const result = Reflect.apply(original, this, args);
            patchQuality(result as AnyObject, config());
            return result;
        };
        manager[name] = wrapped;
        hooks.get(connection)!.push({ target: manager, key: name, original, wrapped });
    }

    const emitter = connection.emitter ?? connection;
    const connected = () => updateConnection(connection);
    const destroy = () => removeConnection(connection);
    emitter?.on?.("connected", connected);
    emitter?.on?.("destroy", destroy);
    listeners.set(connection, { emitter, connected, destroy });
}

function updateConnection(connection: AnyObject): void {
    if (connection.destroyed || !connection.conn) return;
    try {
        const parameters = connection.videoStreamParameters;
        if (parameters?.length) {
            const copy = parameters.map((p: AnyObject) => ({ ...p }));
            patchStreamParameter(copy, config());
            if (typeof connection.conn.setStreamParameters === "function") connection.conn.setStreamParameters(copy);
            else connection.conn.setTransportOptions?.({ streamParameters: copy });
        }
    } catch (error) {
        log.error("Could not update stream parameters", error);
    }
    try {
        const constraints = connection.videoQualityManager?.applyQualityConstraints?.({})?.constraints;
        if (constraints) connection.conn.setTransportOptions?.({ ...constraints });
    } catch (error) {
        log.error("Could not update encoder settings", error);
    }
}

function updateActiveStreams(): void {
    for (const connection of hooks.keys()) updateConnection(connection);
}

function removeConnection(connection: any): void {
    const listener = listeners.get(connection);
    if (listener) {
        listener.emitter?.removeListener?.("connected", listener.connected);
        listener.emitter?.removeListener?.("destroy", listener.destroy);
        listeners.delete(connection);
    }
    for (const { target, key, original, wrapped } of (hooks.get(connection) ?? []).reverse()) {
        if (target[key] === wrapped) target[key] = original;
    }
    hooks.delete(connection);
}

export default definePlugin({
    name: "CustomStreamQuality",
    description: "Set stream encoding quality and advertise separate viewer quality values.",
    tags: ["Voice", "Utility"],
    authors: [{ name: "DavidHiFi", id: 0n }],
    settings,
    start() {
        engine = MediaEngineStore.getMediaEngine();
        if (!engine) {
            log.error("Media engine is unavailable");
            return;
        }
        const emitter = engine.emitter ?? engine;
        connectionListener = connection => patchConnection(connection);
        emitter.on?.("connection", connectionListener);
        for (const connection of engine.connections ?? []) patchConnection(connection);
    },
    stop() {
        if (engine && connectionListener) (engine.emitter ?? engine).removeListener?.("connection", connectionListener);
        for (const connection of [...hooks.keys()]) removeConnection(connection);
        engine = null;
        connectionListener = null;
    }
});
