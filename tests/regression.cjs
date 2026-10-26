const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sandbox = {
    require: () => ({ Plugin: class {}, PluginSettingTab: class {} }),
    module: { exports: {} },
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8'), sandbox);
const plugin = new sandbox.module.exports();
plugin.settings = { fixMath: true, normalizeHorizontalRules: true, reduceMode: 'one', aggressiveMath: false, compactBoundaries: false };
const refine = (text) => plugin.processText(text).text;
assert.equal(refine(String.raw`符号 \\(\mathbf{x}\_k\\)。`), String.raw`符号 $\mathbf{x}_k$。`);
assert.equal(refine(String.raw`\[x+y\]`), '$$\nx+y\n$$');
assert.equal(refine(String.raw`\\[ \begin{aligned} x\_k&=1\\\ y&=2 \end{aligned} \\]`), String.raw`$$
\begin{aligned} x_k&=1\\ y&=2 \end{aligned}
$$`);
assert.equal(refine(String.raw`\\(\max\\{0,x\\} + \\|d\\|\\)`), String.raw`$\max\{0,x\} + \|d\|$`);
for (const input of [
    'Paragraph one.\n\nParagraph two.',
    'Text\n\n$$\nx\n$$\n\n## Heading',
    String.raw`Existing $f(x) + \text{(a)}$ and $$x_1$$.`,
    String.raw`Prose (x) and [ S ] and [link](https://example.com).`,
    '```latex\n\\\\(x\\\\)\n\n\n```',
    '`\\\\(x\\\\)`',
    '---\nformula: "\\\\(x\\\\)"\n\n\n---\n\nText',
]) assert.equal(refine(input), input);
assert.equal(refine('A\n\n\nB'), 'A\n\nB');
plugin.settings.reduceMode = 'step';
assert.equal(refine('A\n\nB'), 'A\n\nB');
plugin.settings.reduceMode = 'one';
assert.equal(refine('> quote\n\nText\n\n| a |\n| --- |'), '> quote\n\nText\n\n| a |\n| --- |');
assert.equal(refine('A\r\n\r\n\\\\[x\\\\]\r\n\r\nB'), 'A\r\n\r\n$$\r\nx\r\n$$\r\n\r\nB');
const source = fs.readFileSync(path.join(__dirname, 'fixtures', 'sqp-original.md'), 'utf8');
const output = refine(source);
assert.equal(refine(output), output, 'SQP cleanup must be idempotent');
assert.ok(!output.includes(String.raw`\\(`));
assert.ok(!output.includes(String.raw`\\[`));
assert.ok(!output.includes(String.raw`\_`));
assert.ok(output.includes(String.raw`\alpha_k\in(0,1]`), 'Interval closing bracket must survive');
assert.ok(output.includes('## Page 2 — 为什么使用 Lagrangian Hessian？'));
assert.equal((output.match(/^\$\$$/gm) || []).length % 2, 0);
console.log('Regression checks passed, including SQP fixture and repeat-run stability.');
if (process.argv[2]) fs.writeFileSync(process.argv[2], output);
plugin.settings.compactBoundaries = true;
assert.equal(refine('Text\n\n$$\nx\n$$\n\nMore text'), 'Text\n$$\nx\n$$\nMore text');
assert.equal(refine('First paragraph\n\nSecond paragraph'), 'First paragraph\n\nSecond paragraph');
assert.equal(refine('> Quote\n\n$$\nx\n$$\n\n| a |\n| --- |'), '> Quote\n\n$$\nx\n$$\n\n| a |\n| --- |');
const compact = refine(output);
assert.equal(refine(compact), compact, 'Compact SQP cleanup must also be idempotent');
assert.equal(compact.replace(/\r?\n/g, ''), output.replace(/\r?\n/g, ''), 'Compact mode must only remove blank lines');
console.log('Compact spacing checks passed.');
