"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.unload = exports.load = exports.methods = void 0;
// @ts-ignore
const package_json_1 = __importDefault(require("../package.json"));
const open_1 = __importDefault(require("open"));
exports.methods = {
    openPanel() {
        Editor.Panel.open(package_json_1.default.name);
    },
    openSite() {
        (0, open_1.default)('https://console.edgegap.com/');
    }
};
function load() { }
exports.load = load;
function unload() { }
exports.unload = unload;
