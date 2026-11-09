// Builds the demo video from recorded scenes + narration.
// Usage: FFMPEG=/path/to/ffmpeg node scripts/video/build.mjs s01 s02 ...
// Each scene: frames ($VIDEO_OUT/<scene>/frames.json) → 30 fps clip; narration $VIDEO_OUT/audio/<scene>.mp3 is laid
// over it starting 0.4 s in. A clip shorter than its narration holds its last frame. Scenes are joined with short fades.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { OUT } from "./rec.mjs";

const FF = process.env.FFMPEG ?? "ffmpeg";
const ff = (args) => execFileSync(FF, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
const dur = (file) => {
  try {
    execFileSync(FF, ["-hide_banner", "-i", file], { stdio: "pipe" });
  } catch (e) {
    const m = String(e.stderr).match(/Duration: (\d+):(\d+):([\d.]+)/);
    if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
  return 0;
};

const scenes = process.argv.slice(2);
const parts = [];
for (const s of scenes) {
  const dir = `${OUT}/${s}`;
  const frames = JSON.parse(readFileSync(`${dir}/frames.json`, "utf8"));
  const lines = [];
  for (let i = 0; i < frames.length - 1; i++) {
    lines.push(`file '${dir}/${frames[i].file}'`, `duration ${Math.max(0.001, frames[i + 1].t - frames[i].t).toFixed(4)}`);
  }
  lines.push(`file '${dir}/${frames.at(-2).file}'`);
  writeFileSync(`${dir}/list.txt`, lines.join("\n"));
  const videoLen = frames.at(-1).t - frames[0].t;
  const audio = `${OUT}/audio/${s}.mp3`;
  const lead = 0.4;
  const audioLen = existsSync(audio) ? dur(audio) : 0;
  const total = Math.max(videoLen, audioLen + lead + 0.5);
  const pad = Math.max(0, total - videoLen);
  const out = `${OUT}/${s}.mp4`;
  const vf = `scale=1920:1080:flags=lanczos,fps=30,tpad=stop_mode=clone:stop_duration=${pad.toFixed(2)},fade=t=in:st=0:d=0.25,fade=t=out:st=${(total - 0.25).toFixed(2)}:d=0.25,format=yuv420p`;
  const args = ["-f", "concat", "-safe", "0", "-i", `${dir}/list.txt`];
  if (audioLen) args.push("-i", audio);
  else args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo");
  const af = audioLen ? `adelay=${lead * 1000}|${lead * 1000},apad,atrim=0:${total.toFixed(2)},aresample=48000` : `atrim=0:${total.toFixed(2)}`;
  ff([...args, "-vf", vf, "-af", af, "-t", total.toFixed(2), "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-c:a", "aac", "-b:a", "192k", "-ac", "2", out]);
  console.log(`${s}: video ${videoLen.toFixed(1)} s, narration ${audioLen.toFixed(1)} s → ${total.toFixed(1)} s`);
  parts.push(out);
}
writeFileSync(`${OUT}/parts.txt`, parts.map((p) => `file '${p}'`).join("\n"));
const final = `${OUT}/standing-demo.mp4`;
ff(["-f", "concat", "-safe", "0", "-i", `${OUT}/parts.txt`, "-c", "copy", "-movflags", "+faststart", final]);
console.log(`→ ${final} (${dur(final).toFixed(1)} s)`);
