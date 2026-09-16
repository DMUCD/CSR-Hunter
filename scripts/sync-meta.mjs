#!/usr/bin/env node
/**
 * 从 CSR-Hunter.user.js 提取 UserScript 头部块，生成 CSR-Hunter.meta.js
 *
 * 为什么需要这个文件：
 *   Tampermonkey 检查更新时，只需要读取脚本头部里的 @version。
 *   与其让每个用户每次都下载完整的 .user.js（几十 KB），
 *   不如让它下载只含头部的 .meta.js（约 1KB），比对完版本再决定要不要下完整脚本。
 *   本脚本负责从源文件自动生成那份 meta 文件，避免手工同步导致两边不一致。
 *
 * 用法：
 *   node scripts/sync-meta.mjs                  生成 / 更新 CSR-Hunter.meta.js
 *   node scripts/sync-meta.mjs --check          只校验是否已同步，不同步则以退出码 1 结束
 *   node scripts/sync-meta.mjs --check-tag v4.4 额外校验 git tag 与 @version 是否一致
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'CSR-Hunter.user.js');
const OUT = join(ROOT, 'CSR-Hunter.meta.js');

const HEADER_RE = /^\/\/ ==UserScript==\r?\n[\s\S]*?^\/\/ ==\/UserScript==[ \t]*$/m;

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const tagIndex = args.indexOf('--check-tag');
const tag = tagIndex >= 0 ? args[tagIndex + 1] : null;

function fail(message) {
    console.error(`✗ ${message}`);
    process.exit(1);
}

function normalize(text) {
    return text.replace(/\r\n/g, '\n');
}

if (!existsSync(SRC)) fail(`找不到源文件：${SRC}`);

const source = normalize(readFileSync(SRC, 'utf8'));
const matched = source.match(HEADER_RE);
if (!matched) fail('在 CSR-Hunter.user.js 里找不到 // ==UserScript== ... // ==/UserScript== 头部块');

const header = matched[0];

const versionMatch = header.match(/^\/\/\s*@version\s+(\S+)/m);
if (!versionMatch) {
    fail('头部缺少 @version —— 缺少它时 Tampermonkey 根本不会做更新检查');
}
const version = versionMatch[1];

// 发布纪律守卫：tag 与 @version 必须一致，否则用户永远收不到更新
if (tag) {
    const tagVersion = tag.replace(/^v/i, '');
    if (tagVersion !== version) {
        fail(
            `tag（${tag}）与 @version（${version}）不一致。\n` +
            `  更新检查只认 @version，tag 只是给人看的。请先把头部 @version 改成 ${tagVersion} 再打 tag。`
        );
    }
    console.log(`✓ tag ${tag} 与 @version ${version} 一致`);
}

// 轻量体检：两个更新地址的扩展名容易写反，写反了不会报错，只会静默失效
const updateURL = (header.match(/^\/\/\s*@updateURL\s+(\S+)/m) || [])[1];
const downloadURL = (header.match(/^\/\/\s*@downloadURL\s+(\S+)/m) || [])[1];
if (updateURL && !updateURL.endsWith('.meta.js')) {
    console.warn(`⚠ @updateURL 通常应指向 .meta.js，当前是：${updateURL}`);
}
if (downloadURL && !downloadURL.endsWith('.user.js')) {
    console.warn(`⚠ @downloadURL 通常应指向 .user.js，当前是：${downloadURL}`);
}
if (downloadURL === 'none') {
    console.warn('⚠ @downloadURL 为 none —— 这会彻底关闭更新检查。');
}

const output = [
    header,
    '',
    '// 本文件由 scripts/sync-meta.mjs 自动生成，请勿手工修改。',
    '// 用途：仅供用户脚本管理器比对版本（@updateURL 指向此文件），不包含任何可执行逻辑。',
    ''
].join('\n');

const previous = existsSync(OUT) ? normalize(readFileSync(OUT, 'utf8')) : null;

if (checkOnly) {
    if (previous === null) fail('CSR-Hunter.meta.js 不存在，请先运行 node scripts/sync-meta.mjs');
    if (previous !== output) fail('CSR-Hunter.meta.js 与源文件头部不同步');
    console.log('✓ meta 文件已同步');
    process.exit(0);
}

if (previous === output) {
    console.log(`= CSR-Hunter.meta.js 无变化（@version ${version}）`);
} else {
    writeFileSync(OUT, output, { encoding: 'utf8' });
    console.log(`✓ 已更新 CSR-Hunter.meta.js（@version ${version}）`);
}
