import assert from "node:assert/strict";
import test from "node:test";
import { matchFrameTelemetry, parseDjiTelemetrySrt } from "./video-telemetry.js";
const srt = `1\n00:00:00,000 --> 00:00:00,033\nFrameCnt: 0 2026-07-08 16:12:57.018\n[focal_len: 40.00] [dzoom_ratio: 1.00], [latitude: 31.229247] [longitude: 121.634603] [rel_alt: 79.969 abs_alt: 96.474] [gb_yaw: -67.6 gb_pitch: -30.0 gb_roll: 0.0]`;
test("parses DJI subtitle telemetry", () => { const track = parseDjiTelemetrySrt(srt); assert.equal(track.samples[0].latitude, 31.229247); assert.equal(track.samples[0].absoluteAltitudeMeters, 96.474); });
test("matches the nearest sample", () => { const track = parseDjiTelemetrySrt(srt); assert.equal(matchFrameTelemetry(20, track)?.matchOffsetMs, -20); assert.equal(matchFrameTelemetry(300, track), null); });
