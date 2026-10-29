// Extension entry: menu commands. The work happens in the panel (panels/default) and core/.
import { shell } from 'electron';

const PKG = 'edgegap-extension';
const UTM = 'utm_source=plugin_cocos&utm_medium=servers_quickstart_plugin&utm_content=plugin_button';

export const methods = {
    openPanel() {
        Editor.Panel.open(PKG);
    },
    openDashboard() {
        shell.openExternal(`https://app.edgegap.com/?${UTM}`);
    },
    openDocs() {
        shell.openExternal(`https://github.com/edgegap/edgegap-cocos-plugin#readme`);
    },
};

export function load() {}
export function unload() {}
