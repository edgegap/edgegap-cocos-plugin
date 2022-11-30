"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
class Logger {
    constructor() {
        this.textArea = {};
        this._lines = [];
        this.totalLines = 0;
    }
    assign(textArea) {
        this.textArea = textArea;
    }
    clear() {
        this.textArea.value = '';
        this.totalLines = 0;
        this._lines = [];
    }
    add(msg) {
        const lines = msg.trim().split('\n');
        for (const line of lines) {
            if (line.length == 0)
                continue;
            this.textArea.value += this.getPrefix() + line.trim() + '\n';
            this.textArea.scrollTop = this.textArea.scrollHeight;
            this._lines.push(line.trim());
            ++this.totalLines;
        }
        return this;
    }
    addBreak() {
        this.textArea.value += this.getPrefix() + '\n';
        this.textArea.scrollTop = this.textArea.scrollHeight;
        this._lines.push('\n');
        this.totalLines++;
        return this;
    }
    replaceLine(line, replaceMsg) {
        const lines = this.textArea.value.split('\n');
        lines[line] = this.getPrefix(line) + replaceMsg.trim();
        this.textArea.value = lines.join('\n');
        this.textArea.scrollTop = this.textArea.scrollHeight;
        this._lines[line] = replaceMsg.trim();
        return this;
    }
    findLine(startsWith) {
        return this._lines.findIndex(o => {
            var _a;
            return ((_a = o.match(startsWith)) === null || _a === void 0 ? void 0 : _a.index) == 0;
        });
    }
    findLineAndReplace(startsWith, replaceMsg) {
        const index = this.findLine(startsWith);
        if (index == -1)
            return false;
        this.replaceLine(index, replaceMsg);
        return true;
    }
    getTotalLines() {
        return this.totalLines;
    }
    getPrefix(line = this.totalLines) {
        return line + ' | ';
    }
}
exports.Logger = Logger;
