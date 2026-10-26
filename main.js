'use strict';

const obsidian = require('obsidian');

const DEFAULT_SETTINGS = {
    reduceMode: 'one',
    fixMath: true,
    normalizeHorizontalRules: true,
    aggressiveMath: false,
    compactBoundaries: false,
};

/* -------------------------------------------------------------------------- */
/*                            Shared text utilities                           */
/* -------------------------------------------------------------------------- */

function detectLineBreak(text) {
    return text.includes('\r\n') ? '\r\n' : '\n';
}

function isFenceLine(line) {
    const m = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
    if (!m) return null;
    return { char: m[2][0], len: m[2].length };
}

function isStandaloneDisplayMathFence(line) {
    return /^\s*\$\$\s*$/.test(line);
}

function isSimpleStandaloneMath(value) {
    const s = value.trim();
    if (!s) return false;

    if (/^[+-]?\d+(?:\.\d+)?$/.test(s)) return true;
    if (/^[+-]?(?:\d+(?:\.\d+)?\s*)?[A-Za-z]{1,3}\d*$/.test(s)) return true;
    if (/^[\u0370-\u03FF]$/.test(s)) return true;

    return false;
}

// ChatGPT can sometimes export a display formula as:
// [
// S
// ]
// Fix Math intentionally treats such very simple bracket blocks as ambiguous.
// For the ChatGPT -> Obsidian workflow, repair this narrow pattern first.
function normalizeSimpleBracketMath(text) {
    const lineBreak = detectLineBreak(text);
    const lines = text.split(/\r?\n/);
    const out = [];
    let inFence = false;
    let fenceChar = null;
    let fenceLen = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const fence = isFenceLine(line);
        if (fence) {
            if (!inFence) {
                inFence = true;
                fenceChar = fence.char;
                fenceLen = fence.len;
            } else if (fence.char === fenceChar && fence.len >= fenceLen) {
                inFence = false;
                fenceChar = null;
                fenceLen = 0;
            }
            out.push(line);
            continue;
        }

        if (!inFence && /^\s*\[\s*$/.test(line) && i + 2 < lines.length) {
            const inner = lines[i + 1];
            const close = lines[i + 2];
            if (/^\s*\]\s*$/.test(close) && isSimpleStandaloneMath(inner)) {
                const indent = (line.match(/^\s*/) || [''])[0];
                out.push(`${indent}$$`);
                out.push(inner.trim());
                out.push(`${indent}$$`);
                i += 2;
                continue;
            }
        }

        out.push(line);
    }

    return out.join(lineBreak);
}

/* -------------------------------------------------------------------------- */
/*                         Fix Math core integration                          */
/* -------------------------------------------------------------------------- */

function transformMathText(md) {
    const segments = splitByCodeFences(md);
    const stats = { inlineCount: 0, blockCount: 0 };
    const result = segments.map((seg) => {
        if (seg.type === 'code') return seg.text;
        return convertExplicitMath(seg.text, stats);
    }).join('');
    return { text: result, stats };
}

// Recognize explicit delimiters before considering ambiguous brackets. Clipboard
// HTML-to-Markdown conversion can escape the delimiter backslash a second time.
function convertExplicitMath(text, stats) {
    const lineBreak = detectLineBreak(text);
    const clean = (inner, clipboardEscaped) => {
        if (!clipboardEscaped) return inner.trim();
        return inner.trim()
            .replace(/\\([_*])/g, '$1')
            .replace(/\\{3}(?!\\)/g, '\\\\')
            .replace(/\\{2}([{}|])/g, '\\$1');
    };
    // Protect inline code and already valid math as complete tokens. In
    // particular, parentheses inside $...$ must never be converted again.
    const tokens = /(`+)[^\n]*?\1|(?<!\\)\$\$[\s\S]*?(?<!\\)\$\$|(?<![\\$])\$(?!\$)(?:\\.|[^$\r\n])*?(?<!\\)\$(?!\$)|(?<!\\)(\\{1,2})\[([\s\S]*?)\2\]|(?<!\\)(\\{1,2})\(([^\r\n]*?)\4\)/g;
    return text.replace(tokens, (match, code, displaySlash, displayInner, inlineSlash, inlineInner) => {
        if (code || match.startsWith('$')) return match;
        if (displaySlash) {
            stats.blockCount++;
            return `$$${lineBreak}${clean(displayInner, displaySlash.length === 2)}${lineBreak}$$`;
        }
        stats.inlineCount++;
        return `$${clean(inlineInner, inlineSlash.length === 2)}$`;
    });
}

// Split while preserving the original line endings and without touching fenced code blocks.
function splitByCodeFences(md) {
    const pieces = md.split(/(\r?\n)/);
    const segments = [];
    let buf = '';
    let inCode = false;
    let fenceChar = null;
    let fenceLen = 0;

    const flush = (type) => {
        if (buf) {
            segments.push({ type, text: buf });
            buf = '';
        }
    };

    for (let i = 0; i < pieces.length; i += 2) {
        const line = pieces[i] || '';
        const newline = pieces[i + 1] || '';
        const fence = isFenceLine(line);

        if (fence) {
            if (!inCode) {
                flush('text');
                inCode = true;
                fenceChar = fence.char;
                fenceLen = fence.len;
                buf += line + newline;
            } else {
                buf += line + newline;
                if (fence.char === fenceChar && fence.len >= fenceLen) {
                    flush('code');
                    inCode = false;
                    fenceChar = null;
                    fenceLen = 0;
                }
            }
        } else {
            buf += line + newline;
        }
    }

    flush(inCode ? 'code' : 'text');
    return segments;
}

function convertMath(text, stats) {
    const inlineCodeSpans = [];
    text = text.replace(/(`+)([^`\n]+)\1/g, (match) => {
        const idx = inlineCodeSpans.length;
        inlineCodeSpans.push(match);
        return `\x00CODE${idx}\x00`;
    });

    // > \[ ... \] -> > $$ ... $$
    text = text.replace(
        /^>[ \t]*\\\[[ \t]*\r?\n([\s\S]*?)\r?\n>[ \t]*\\\][ \t]*$/gm,
        (_match, inner) => {
            const cleaned = inner
                .split(/\r?\n/)
                .map((line) => line.replace(/^>[ \t]*/, ''))
                .join(' ');
            stats.blockCount++;
            return `> $$ ${cleaned.trim()} $$`;
        }
    );

    // > [ ... ] -> > [ ... ] on one line so the single-line bracket logic can see it.
    text = text.replace(
        /^>[ \t]*\[[ \t]*\r?\n([\s\S]*?)\r?\n>[ \t]*\][ \t]*$/gm,
        (_match, inner) => {
            const cleaned = inner
                .split(/\r?\n/)
                .map((line) => line.replace(/^>[ \t]*/, ''))
                .join(' ');
            return `> [ ${cleaned.trim()} ]`;
        }
    );

    text = text.replace(/^#[ \t]*(\[[ \t]*)$/gm, (_m, bracket) => bracket);
    text = text.replace(/^#[ \t]*(\\begin\{)/gm, '$1');

    const displayBackslashRe = /(^|[^\\])\\\[((?:[\s\S]*?))\\\]/g;
    const hasLaTeXCommand = (s) => /\\[a-zA-Z]+/.test(s);
    const inlineBackslashRe = /(^|[^\\])\\\((.+?)\\\)/g;

    const isMathy = (s, strict = false) => {
        if (/[\\_^→∞±≥≤]|\\text\{/.test(s)) return true;
        if (/\d+\{[,.\s]\}\d+/.test(s)) return true;

        const hasDigit = /\d/.test(s);
        const hasOp = /[+\-*/=<>,]/.test(s);
        if (hasDigit && hasOp) return true;

        if (!strict) {
            if (/^\s*-?\d+(?:\.\d+)?\s*$/.test(s)) return true;
            if (/^[a-zA-Z](?:'+)?$/.test(s.trim())) return true;
            if (/^[A-Z]{2,}(?:'+)?$/.test(s.trim())) return true;
        }

        if (/^[a-zA-Z]\s*[=<>+\-*/]\s*[a-zA-Z]/.test(s)) return true;

        const hasLetters = /[a-zA-Z]/.test(s);
        const hasWords = /\b[a-zA-Z]{2,}\b/.test(s);
        if (hasLetters && hasOp && !hasWords) return true;

        return false;
    };

    text = text.replace(/\\\][ \t]*\\\[/g, '\\]\n\\[');

    let out = text.replace(displayBackslashRe, (_, pre, inner) => {
        stats.blockCount++;
        return `${pre}$$\n${inner.trim()}\n$$`;
    });

    // Multiline [ ... ] -> $$ ... $$ when math-like.
    {
        const lines = out.split(/\r?\n/);
        const result = [];
        let i = 0;
        while (i < lines.length) {
            const line = lines[i];
            const openMatch = line.match(/^([ \t]*(?:[#>\-*+0-9.]+\s*)?)\[[ \t]*$/);
            if (openMatch) {
                const prefix = openMatch[1];
                let depth = 1;
                let j = i + 1;
                const innerLines = [];
                let found = false;

                while (j < lines.length) {
                    const l = lines[j];
                    let closedHere = false;
                    for (const ch of l) {
                        if (ch === '[') depth++;
                        else if (ch === ']') {
                            depth--;
                            if (depth === 0) {
                                closedHere = true;
                                break;
                            }
                        }
                    }
                    if (closedHere) {
                        if (/^[ \t]*\][ \t]*$/.test(l)) found = true;
                        break;
                    }
                    innerLines.push(l);
                    j++;
                }

                if (found) {
                    const inner = innerLines.join('\n');
                    if (hasLaTeXCommand(inner) || isMathy(inner, true) || (innerLines.length === 1 && isSimpleStandaloneMath(inner))) {
                        stats.blockCount++;
                        result.push(`${prefix}$$`);
                        result.push(inner.trim());
                        result.push('$$');
                        i = j + 1;
                        continue;
                    }
                }
            }
            result.push(line);
            i++;
        }
        out = result.join('\n');
    }

    // Single-line [ ... ] handling outside $$ blocks.
    {
        const bracketParts = out.split(/(\$\$[\s\S]*?\$\$)/);
        out = bracketParts.map((part, idx) => {
            if (idx % 2 === 1) return part;

            let p = part.replace(
                /\[\s*\\left\[[^\n]*?\\right\][^\n]*?\]/g,
                (match, offset, fullText) => {
                    const before = fullText.slice(0, offset);
                    const afterBracket = fullText[offset + match.length];
                    if (afterBracket === '(' || afterBracket === ':') return match;
                    if (match.startsWith('[[')) return match;
                    const inner = match.slice(1, -1);
                    if (inner.startsWith('^')) return match;
                    const openInline = (before.match(/\\\(/g) || []).length;
                    const closeInline = (before.match(/\\\)/g) || []).length;
                    if (openInline > closeInline) return match;
                    const singleDollars = (before.match(/(?<!\$)\$(?!\$)/g) || []).length;
                    if (singleDollars % 2 === 1) return match;
                    stats.blockCount++;
                    return `$$\n${inner.trim()}\n$$`;
                }
            );

            p = p.replace(
                /\[([^\]]+)\]/g,
                (match, inner, offset, fullText) => {
                    const before = fullText.slice(0, offset);
                    const afterBracket = fullText[offset + match.length];
                    if (afterBracket === '(' || afterBracket === ':') return match;
                    if (/\\left\s*$/.test(before) || /\\right/.test(inner) || /\\left/.test(inner)) return match;
                    if (match.startsWith('[[')) return match;
                    if (inner.startsWith('^')) return match;
                    if (!/^\s/.test(inner)) return match;
                    if (/^\s*\d+(?:\s*,\s*\d+)*\s*$/.test(inner)) return match;
                    if (/^\s*[a-zA-Z](?:\s*,\s*[a-zA-Z])*\s*$/.test(inner)) return match;
                    const openInline = (before.match(/\\\(/g) || []).length;
                    const closeInline = (before.match(/\\\)/g) || []).length;
                    if (openInline > closeInline) return match;
                    const singleDollars = (before.match(/(?<!\$)\$(?!\$)/g) || []).length;
                    if (singleDollars % 2 === 1) return match;
                    if (hasLaTeXCommand(inner) || isMathy(inner, true) || isSimpleStandaloneMath(inner)) {
                        stats.blockCount++;
                        return `$$\n${inner.trim()}\n$$`;
                    }
                    return match;
                }
            );

            return p;
        }).join('');
    }

    // Repair common ChatGPT export artifacts inside display math.
    out = out.replace(/\$\$([\s\S]*?)\$\$/g, (block) =>
        block
            .replace(/(?<!\\)\\[ \t]*$/gm, '\\\\')
            .replace(/(?<!\\)\\(?=[0-9-])/g, '\\\\')
            .replace(/^={3,}$/gm, '=')
            .replace(/^-{3,}$/gm, '-')
            .replace(/^#{1,6}[ \t]+(.*)/gm, '$1\n-')
            .replace(/^([+-]),/gm, '$1')
            .replace(/(?<!\\)#/g, '\\#')
    );

    const parts = out.split(/(\$\$[\s\S]*?\$\$)/);
    out = parts.map((part, idx) => {
        if (idx % 2 === 1 && part.startsWith('$$')) return part;

        let chunk = convertPlainParens(part, isMathy, stats);
        chunk = chunk.replace(inlineBackslashRe, (_, pre, inner) => {
            stats.inlineCount++;
            return `${pre}$${inner.trim()}$`;
        });
        return chunk;
    }).join('');

    if (inlineCodeSpans.length > 0) {
        out = out.replace(/\x00CODE(\d+)\x00/g, (_, idxStr) => inlineCodeSpans[parseInt(idxStr, 10)]);
    }

    return out;
}

function convertPlainParens(text, isMathy, stats) {
    let result = '';
    let i = 0;
    const isWhitespace = (ch) => /\s/.test(ch);

    while (i < text.length) {
        const ch = text[i];

        if (ch === '\\' && i + 1 < text.length && text[i + 1] === '(') {
            const end = text.indexOf('\\)', i + 2);
            if (end !== -1) {
                result += text.slice(i, end + 2);
                i = end + 2;
            } else {
                result += ch;
                i += 1;
            }
            continue;
        }

        if (ch === '(') {
            const prev = i === 0 ? '' : text[i - 1];
            if (i > 0 && !isWhitespace(prev) && prev !== '(') {
                result += ch;
                i += 1;
                continue;
            }

            let depth = 1;
            let j = i + 1;
            while (j < text.length && depth > 0) {
                const c = text[j];
                if (c === '(') depth += 1;
                else if (c === ')') depth -= 1;
                j += 1;
            }

            if (depth !== 0) {
                result += ch;
                i += 1;
                continue;
            }

            const closeIndex = j - 1;
            const inner = text.slice(i + 1, closeIndex);

            if (/\\\(/.test(inner) || /\\\)/.test(inner)) {
                result += ch;
                i += 1;
                continue;
            }

            let k = closeIndex + 1;
            let primes = '';
            while (k < text.length && text[k] === "'") {
                primes += "'";
                k += 1;
            }

            const after = k < text.length ? text[k] : '';
            const koreanParticleRe = /^(?:으로|에서|에게|까지|부터|처럼|보다|마다|이나|이라|은|는|이|가|을|를|와|과|의|에|께|도|만|로|나|라)/;
            const afterIsDelim =
                after === '' ||
                isWhitespace(after) ||
                ').,;:?!*_，。！？；：、'.includes(after) ||
                koreanParticleRe.test(text.slice(k));

            if (!afterIsDelim) {
                result += ch;
                i += 1;
                continue;
            }

            const innerWithoutCommands = inner.replace(/\\[A-Za-z]+/g, '');
            const hasLaTeXCommand = /\\[a-zA-Z]+/.test(inner);
            if (!hasLaTeXCommand && /\p{Ll}{3,}/u.test(innerWithoutCommands)) {
                result += ch;
                i += 1;
                continue;
            }

            if (!isMathy(inner)) {
                result += ch;
                i += 1;
                continue;
            }

            stats.inlineCount++;
            const core = inner.trim() + primes;
            result += `$${core}$`;
            i = k;
        } else {
            result += ch;
            i += 1;
        }
    }

    return result;
}

/* -------------------------------------------------------------------------- */
/*                    Horizontal rule: ---  ->  ***                          */
/* -------------------------------------------------------------------------- */

function normalizeHorizontalRules(text, protectFrontmatter = true) {
    const lineBreak = detectLineBreak(text);
    const lines = text.split(/\r?\n/);
    const out = [...lines];

    let inCode = false;
    let fenceChar = null;
    let fenceLen = 0;
    let inDisplayMath = false;

    // YAML frontmatter is only recognized at the beginning of a document/selection.
    let frontmatterEnd = -1;
    if (protectFrontmatter && lines.length > 0 && /^\s*---\s*$/.test(lines[0])) {
        for (let i = 1; i < lines.length; i++) {
            if (/^\s*(?:---|\.\.\.)\s*$/.test(lines[i])) {
                frontmatterEnd = i;
                break;
            }
        }
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (frontmatterEnd >= 0 && i <= frontmatterEnd) continue;

        const fence = isFenceLine(line);
        if (fence) {
            if (!inCode) {
                inCode = true;
                fenceChar = fence.char;
                fenceLen = fence.len;
            } else if (fence.char === fenceChar && fence.len >= fenceLen) {
                inCode = false;
                fenceChar = null;
                fenceLen = 0;
            }
            continue;
        }
        if (inCode) continue;

        if (isStandaloneDisplayMathFence(line)) {
            inDisplayMath = !inDisplayMath;
            continue;
        }
        if (inDisplayMath) continue;

        const m = line.match(/^(\s*)---(\s*)$/);
        if (!m) continue;

        // Protect Setext H2 syntax:
        // Title
        // ---
        // A true separator copied from ChatGPT normally has a blank line before it.
        const previousLine = i > 0 ? lines[i - 1] : '';
        if (i > 0 && previousLine.trim() !== '') continue;

        out[i] = `${m[1]}***${m[2]}`;
    }

    return out.join(lineBreak);
}

/* -------------------------------------------------------------------------- */
/*                      Markdown-safe blank line cleanup                     */
/* -------------------------------------------------------------------------- */

function reduceBlankLinesSafely(text, mode, protectFrontmatter = true, compactBoundaries = false) {
    const lineBreak = detectLineBreak(text);
    const lines = text.split(/\r?\n/);
    const out = [];

    let inCode = false;
    let fenceChar = null;
    let fenceLen = 0;
    let inDisplayMath = false;

    // Preserve YAML frontmatter exactly.
    let frontmatterEnd = -1;
    if (protectFrontmatter && lines.length > 0 && /^\s*---\s*$/.test(lines[0])) {
        for (let i = 1; i < lines.length; i++) {
            if (/^\s*(?:---|\.\.\.)\s*$/.test(lines[i])) {
                frontmatterEnd = i;
                break;
            }
        }
    }

    const isBlank = (line) => /^[ \t]*$/.test(line);
    const isBlockquoteLine = (line) => /^\s*>/.test(line);
    const requiresBlankBefore = (line) => /^\s*\|/.test(line);
    const prefersNoBlankBoundary = (line) =>
        /^\s*\$\$\s*$/.test(line) ||
        /^\s*\*\*\*\s*$/.test(line);

    let i = 0;
    while (i < lines.length) {
        const line = lines[i];

        // Frontmatter: copy as-is.
        if (frontmatterEnd >= 0 && i <= frontmatterEnd) {
            out.push(line);
            i++;
            continue;
        }

        const fence = isFenceLine(line);
        if (fence) {
            out.push(line);
            if (!inCode) {
                inCode = true;
                fenceChar = fence.char;
                fenceLen = fence.len;
            } else if (fence.char === fenceChar && fence.len >= fenceLen) {
                inCode = false;
                fenceChar = null;
                fenceLen = 0;
            }
            i++;
            continue;
        }

        if (inCode) {
            out.push(line);
            i++;
            continue;
        }

        if (isStandaloneDisplayMathFence(line)) {
            out.push(line);
            inDisplayMath = !inDisplayMath;
            i++;
            continue;
        }

        if (inDisplayMath) {
            out.push(line);
            i++;
            continue;
        }

        if (!isBlank(line)) {
            out.push(line);
            i++;
            continue;
        }

        const runStart = i;
        while (i < lines.length && isBlank(lines[i])) i++;
        const runLength = i - runStart;

        const previousLine = out.length > 0 ? out[out.length - 1] : '';
        const nextLine = i < lines.length ? lines[i] : '';

        let target = mode === 'step' ? Math.max(1, runLength - 1) : Math.min(1, runLength);

        // Display-math fences and *** horizontal rules do not need surrounding blank lines.
        // Remove those gaps even in Strict mode.
        if (compactBoundaries && (prefersNoBlankBoundary(previousLine) || prefersNoBlankBoundary(nextLine)) && runLength > 0) {
            target = 0;
        }

        // Keep only genuinely structural spacing: blockquotes/callouts need a blank
        // line before following prose to prevent Markdown lazy continuation, and
        // tables are kept separated from the preceding paragraph. These safety
        // locks take precedence over the no-gap preference above.
        if ((isBlockquoteLine(previousLine) || requiresBlankBefore(nextLine)) && runLength > 0) {
            target = Math.max(target, 1);
        }

        for (let n = 0; n < target; n++) out.push('');
    }

    return out.join(lineBreak);
}

/* -------------------------------------------------------------------------- */
/*                                  Plugin                                    */
/* -------------------------------------------------------------------------- */

class PasteRefinerPlugin extends obsidian.Plugin {
    async onload() {
        await this.loadSettings();
        this.addSettingTab(new PasteRefinerSettingTab(this.app, this));

        // Keep the original command ID so existing hotkeys continue to work.
        this.addCommand({
            id: 'refine-pasted-content',
            name: 'Refine pasted content',
            editorCallback: (editor) => this.polish(editor),
        });
    }

    async loadSettings() {
        const loaded = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded || {});
        // Compatibility with the older custom build that stored "One-click".
        if (this.settings.reduceMode === 'One-click') this.settings.reduceMode = 'one';
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    processText(text, protectFrontmatter = true) {
        const frontmatter = protectFrontmatter ? text.match(/^---[^\S\r\n]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[^\S\r\n]*(?:\r?\n|$)/) : null;
        const prefix = frontmatter ? frontmatter[0] : '';
        let result = text.slice(prefix.length);
        const stats = { inlineCount: 0, blockCount: 0 };

        if (this.settings.fixMath) {
            const mathResult = transformMathText(result);
            result = mathResult.text;
            stats.inlineCount = mathResult.stats.inlineCount;
            stats.blockCount = mathResult.stats.blockCount;
            if (this.settings.aggressiveMath) {
                result = splitByCodeFences(result).map((segment) => {
                    if (segment.type === 'code') return segment.text;
                    return segment.text.split(/(\$\$[\s\S]*?\$\$|(?<!\\)\$[^$\r\n]+\$)/).map((part, index) =>
                        index % 2 ? part : convertMath(part, stats)
                    ).join('');
                }).join('');
            }
        }

        if (this.settings.normalizeHorizontalRules) {
            result = normalizeHorizontalRules(result, protectFrontmatter);
        }

        result = reduceBlankLinesSafely(result, this.settings.reduceMode, protectFrontmatter, this.settings.compactBoundaries);
        return { text: prefix + result, stats };
    }

    polish(editor) {
        const selection = editor.getSelection();
        const original = selection || editor.getValue();
        const processed = this.processText(original, !selection);

        if (processed.text === original) {
            new obsidian.Notice('Paste Refiner: no changes required');
            return;
        }

        if (selection) editor.replaceSelection(processed.text);
        else editor.setValue(processed.text);

        const formulaCount = processed.stats.inlineCount + processed.stats.blockCount;
        const suffix = formulaCount > 0 ? ` · fixed ${formulaCount} formula${formulaCount === 1 ? '' : 's'}` : '';
        new obsidian.Notice(`Paste Refiner: done${suffix}`);
    }
}

class PasteRefinerSettingTab extends obsidian.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        new obsidian.Setting(containerEl)
            .setName('Fix Math conversion')
            .setDesc('Converts explicit LaTeX math delimiters, including double-escaped clipboard exports. Preserves existing dollar math, code and document frontmatter.')
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.fixMath)
                    .onChange(async (value) => {
                        this.plugin.settings.fixMath = value;
                        await this.plugin.saveSettings();
                    });
            });

        new obsidian.Setting(containerEl)
            .setName('Use *** for horizontal rules')
            .setDesc('Converts standalone Markdown horizontal-rule lines from --- to *** while protecting YAML frontmatter, fenced code, display math, and Setext headings.')
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.normalizeHorizontalRules)
                    .onChange(async (value) => {
                        this.plugin.settings.normalizeHorizontalRules = value;
                        await this.plugin.saveSettings();
                    });
            });

        new obsidian.Setting(containerEl)
            .setName('Blank line reduction mode')
            .setDesc('Gradual removes one surplus blank line per run. Strict collapses repeated blank lines to one. Both preserve the last blank line separating paragraphs and blocks.')
            .addDropdown((dropDown) => {
                dropDown
                    .addOption('step', 'Gradual: reduce by one')
                    .addOption('one', 'Strict: collapse to one blank line')
                    .setValue(this.plugin.settings.reduceMode)
                    .onChange(async (value) => {
                        this.plugin.settings.reduceMode = value;
                        await this.plugin.saveSettings();
                    });
            });

        new obsidian.Setting(containerEl)
            .setName('Recognize ambiguous math')
            .setDesc('Also guesses formulas in ordinary parentheses and square brackets. May interpret prose as math; disabled by default.')
            .addToggle((toggle) => toggle.setValue(this.plugin.settings.aggressiveMath).onChange(async (value) => {
                this.plugin.settings.aggressiveMath = value;
                await this.plugin.saveSettings();
            }));

        new obsidian.Setting(containerEl)
            .setName('Compact math and horizontal-rule spacing')
            .setDesc('Removes existing blank lines next to display-math fences and *** rules. Disabled by default to retain block spacing.')
            .addToggle((toggle) => toggle.setValue(this.plugin.settings.compactBoundaries).onChange(async (value) => {
                this.plugin.settings.compactBoundaries = value;
                await this.plugin.saveSettings();
            }));
    }
}

module.exports = PasteRefinerPlugin;
