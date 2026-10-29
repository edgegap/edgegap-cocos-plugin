"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.methods = void 0;
exports.load = load;
exports.unload = unload;
// Extension entry: menu commands. The work happens in the panel (panels/default) and core/.
const electron_1 = require("electron");
const PKG = 'edgegap-extension';
const UTM = 'utm_source=plugin_cocos&utm_medium=servers_quickstart_plugin&utm_content=plugin_button';
exports.methods = {
    openPanel() {
        Editor.Panel.open(PKG);
    },
    openDashboard() {
        electron_1.shell.openExternal(`https://app.edgegap.com/?${UTM}`);
    },
    openDocs() {
        electron_1.shell.openExternal(`https://github.com/edgegap/edgegap-cocos-plugin#readme`);
    },
};
function load() { }
function unload() { }
