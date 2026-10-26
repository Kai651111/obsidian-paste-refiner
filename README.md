# Obsidian Paste Refiner

Cleans Markdown copied from ChatGPT and other AI tools.

## Features

- Converts explicit LaTeX parentheses/bracket delimiters to Obsidian dollar math, including double-escaped clipboard exports.
- Repairs clipboard-escaped underscores, stars, braces, norm delimiters and triple-backslash row separators inside double-escaped formulas.
- Protects existing dollar math, inline code, fenced code and document YAML frontmatter during default math conversion.
- Converts standalone --- rules to ***, protecting frontmatter, fenced code, display math and Setext headings.
- Preserves the last blank line separating paragraphs. Strict collapses repeated blank lines to one; Gradual removes one surplus blank line per invocation.
- Preserves existing blank lines around display math and rules by default. Optional compact spacing removes these gaps with quote/callout and table spacing safeguards.
- Optional ambiguous-math recognition enables legacy guesses for ordinary parentheses and square brackets; disabled by default.

## Usage

Run **Refine pasted content** from the command palette or assign a hotkey. A nonempty selection is processed in place; otherwise the entire note is processed. The plugin does not intercept paste events.

Strict blank-line cleanup is the default for new installations. Existing saved mode preferences remain in effect. Reload Obsidian or disable/re-enable **Paste Refiner** after updating plugin files.

## Validation

Run `node tests/regression.cjs`. Tests cover the original SQP clipboard export, repeat-run stability, formula boundaries, interval brackets, code/frontmatter protection, paragraph spacing and CRLF preservation. The fixture is an unmodified source sample.

## Credits

Adapted from MIT-licensed Riverise/obsidian-paste-polish and loglux/fix-math-for-obsidian. See THIRD_PARTY_NOTICES.md for original copyright and license notices.
