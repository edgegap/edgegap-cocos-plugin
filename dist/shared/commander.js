"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeDockerRemoveImage = exports.executeDockerRemove = exports.executeDockerStop = exports.executeDockerRun = exports.executeDockerPush = exports.executeDockerBuild = exports.executeServerBuild = void 0;
const utils_1 = require("./utils");
function executeServerBuild(path, cmd) {
    const formatted = cmd.trim().replace('${path}', path);
    utils_1.logger.add(`Started server build task...`);
    return new Promise((resolve, reject) => {
        (0, utils_1.executeCommand)(formatted, (buffer) => {
            const data = buffer.toString('utf-8');
            if (data.trim().startsWith('>'))
                return;
            utils_1.logger.add(data);
        }, (code) => {
            if (code != 0) {
                utils_1.logger.add(`Failed building server. Exit code: ${code}.`);
            }
            else {
                utils_1.logger.add(`Successfully built the server.`);
            }
            resolve({ code: code });
        }, (error) => {
            reject(error);
        });
    });
}
exports.executeServerBuild = executeServerBuild;
function executeDockerBuild(url, path) {
    utils_1.logger.addBreak().add(`Building image ${url} from server on path ${path}...`);
    return new Promise((resolve, reject) => {
        (0, utils_1.executeCommand)(`docker build -t ${url} ${path} 2>&1`, (buffer) => {
            const data = buffer.toString('utf-8');
            utils_1.logger.add(data);
        }, (code) => {
            if (code != 0) {
                utils_1.logger.add(`Failed building image ${url}. Exit code: ${code}.`);
            }
            else {
                utils_1.logger.add(`Built image ${url}.`);
            }
            resolve({ code: code });
        }, (error) => {
            reject(error);
        });
    });
}
exports.executeDockerBuild = executeDockerBuild;
function executeDockerPush(url) {
    utils_1.logger.addBreak().add(`Pushing image ${url}...`);
    return new Promise((resolve, reject) => {
        (0, utils_1.executeCommand)(`docker push ${url} 2>&1`, (buffer) => {
            const data = buffer.toString('utf-8');
            const lines = data.trim().split('\n');
            // for pushing, we have to utilize line replacement to provide clean output
            for (const line of lines) {
                const result = line.match(/\w+:/);
                if (result && result.index == 0) {
                    if (!utils_1.logger.findLineAndReplace(result.toString(), line)) {
                        utils_1.logger.add(line);
                    }
                }
                else {
                    utils_1.logger.add(line);
                }
            }
        }, (code) => {
            if (code != 0) {
                utils_1.logger.add(`Failed pushing image ${url}. Exit code: ${code}.`);
            }
            else {
                utils_1.logger.add(`Pushed image ${url} into the repository.`);
            }
            resolve({ code: code });
        }, (error) => {
            reject(error);
        });
    });
}
exports.executeDockerPush = executeDockerPush;
function executeDockerRun(image, name) {
    const nameProp = name === undefined ? '' : `--name ${name}`;
    utils_1.logger.addBreak().add(`Starting container ${name}...`);
    return new Promise((resolve, reject) => {
        let timer = null;
        let lastMessage = '';
        (0, utils_1.executeCommand)(`docker run ${nameProp} ${image} 2>&1`, (buffer) => {
            if (!timer) {
                timer = setTimeout(() => {
                    utils_1.logger.add(`Container ${name} running without errors.`);
                    resolve({ code: 0, exited: false });
                }, 2000);
            }
            lastMessage = buffer.toString();
        }, (code) => {
            if (code != 0) {
                utils_1.logger.add(`Error running ${name} container. Exit code: ${code}. Error:`).add(lastMessage);
            }
            else {
                utils_1.logger.add(`Container ${name} exited without errors.`);
            }
            clearTimeout(timer);
            resolve({ code: code, exited: true });
        }, (error) => {
            clearTimeout(timer);
            reject(error);
        });
    });
}
exports.executeDockerRun = executeDockerRun;
function executeDockerStop(container) {
    utils_1.logger.addBreak().add(`Stopping container ${container}...`);
    return new Promise((resolve, reject) => {
        (0, utils_1.executeCommand)(`docker stop ${container} 2>&1`, (buffer) => { }, (code) => {
            if (code != 0) {
                utils_1.logger.add(`Failed stopping container ${container}. Exit code: ${code}.`);
            }
            else {
                utils_1.logger.add(`Stopped container ${container}.`);
            }
            resolve({ code: code });
        }, (error) => {
            reject(error);
        });
    });
}
exports.executeDockerStop = executeDockerStop;
function executeDockerRemove(container) {
    utils_1.logger.addBreak().add(`Removing container ${container}...`);
    return new Promise((resolve, reject) => {
        (0, utils_1.executeCommand)(`docker rm ${container}`, (buffer) => { }, (code) => {
            if (code != 0) {
                utils_1.logger.add(`Failed removing container ${container}. Exit code: ${code}.`);
            }
            else {
                utils_1.logger.add(`Removed container ${container}.`);
            }
            resolve({ code: code });
        }, (error) => {
            reject(error);
        });
    });
}
exports.executeDockerRemove = executeDockerRemove;
function executeDockerRemoveImage(image) {
    let imageID = '';
    utils_1.logger.addBreak().add(`Getting ID of the image ${image}...`);
    return new Promise((resolve, reject) => {
        (0, utils_1.executeCommand)(`docker images ${image} -a -q 2>&1`, (buffer) => {
            const data = buffer.toString('utf-8').trim();
            imageID = data; // imageID is returned in stdout
        }, (code) => {
            if (code != 0 || imageID.length == 0) { // don't remove image without an id
                utils_1.logger.add(`Failed to get image ${image} ID. Exit code: ${code}.`);
                resolve({ code: code });
                return;
            }
            utils_1.logger.add(`Removing the image ${imageID}...`);
            (0, utils_1.executeCommand)(`docker rmi ${imageID} 2>&1`, (buffer) => { }, (code) => {
                if (code != 0) {
                    utils_1.logger.add(`Failed to remove image ${imageID}. Exit code: ${code}.`);
                }
                else {
                    utils_1.logger.add(`Removed image ${imageID}.`);
                }
                resolve({ code: code });
            }, (error) => {
                reject(error);
            });
        }, (error) => {
            reject(error);
        });
    });
}
exports.executeDockerRemoveImage = executeDockerRemoveImage;
