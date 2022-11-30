"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeApplicationNameFromImage = exports.makeContainerNameFromURL = exports.callAPI = exports.executeCommand = exports.getCommandLine = exports.logger = void 0;
const child_process_1 = require("child_process");
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("./logger");
exports.logger = new logger_1.Logger();
/**
 * Used only for opening the Edgegap Dashboard in the browser.
 *
 * @returns Valid execute command for the current platform.
 */
function getCommandLine() {
    switch (process.platform) {
        case 'darwin': return 'open';
        case 'win32': return 'start';
        default: return 'xdg-open';
    }
}
exports.getCommandLine = getCommandLine;
/**
 * Used to execute command in the CLI.
 *
 * @param cmd Command that needs to be executed.
 * @param onProgress Callback function that will be launched when any data is passed into the stdout.
 * @param onFinish Callback function that will be launched after process exits, will contain the exit code.
 * @param onError Callback function that will be launched on error, with throwed error included.
 * @returns Returns the running process.
 */
function executeCommand(cmd, onProgress, onFinish, onError) {
    const words = cmd.split(' ');
    const app = words.splice(0, 1)[0];
    const process = (0, child_process_1.spawn)(app, words, { shell: true });
    process.stdout.on('data', onProgress);
    process.on('error', onError === undefined ? (error) => { console.error(error); } : onError);
    process.on('close', onFinish);
    return process;
}
exports.executeCommand = executeCommand;
/**
 * Function that utilizes the axios library to make calls to the Edgegap API.
 *
 * @param path Path of the desired call.
 * @param token Token used for authorization with Edgegap endpoints.
 * @param data Data that will be send with the call.
 * @param method Method used for the call (post, get, delete, patch), defaults to post.
 * @returns Returns new promise, that will resolve with status and data (even with status different then 2xx) and will reject if any internal error appears.
 */
function callAPI(path, token, data, method = 'post') {
    return new Promise((resolve, reject) => {
        (0, axios_1.default)(`https://api.edgegap.com/v1/${path}`, {
            method: method,
            data: data,
            headers: {
                'Authorization': `token ${token}`
            }
        }).then(res => {
            resolve({
                status: res.status,
                data: res.data
            });
        }).catch(error => {
            if (error.response) {
                resolve({
                    status: error.response.status,
                    data: error.response.data
                });
            }
            else {
                reject(error);
            }
        });
    });
}
exports.callAPI = callAPI;
/**
 * Function will return valid container name for the image.
 *
 * @param url Image url.
 * @returns Container name.
 */
function makeContainerNameFromURL(url) {
    return url.replace(/[\/:]/g, '-') + '-container';
}
exports.makeContainerNameFromURL = makeContainerNameFromURL;
/**
 * Function will return valid application name based on the image name.
 *
 * @param image Image name.
 * @returns Application name.
 */
function makeApplicationNameFromImage(image) {
    return image + '-app';
}
exports.makeApplicationNameFromImage = makeApplicationNameFromImage;
