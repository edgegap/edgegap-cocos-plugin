"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiStopDeployment = exports.apiDeployApplicationVersion = exports.apiPatchApplicationVersion = exports.apiCreateApplicationVersion = exports.apiCreateApplication = void 0;
const utils_1 = require("./utils");
function apiCreateApplication(token, params) {
    return new Promise((resolve, reject) => {
        (0, utils_1.callAPI)('app', token, {
            name: params.name,
            is_active: params.is_active === undefined ? true : params.is_active,
            image: params.image || ""
        })
            .then(result => resolve(result))
            .catch(error => reject(error));
    });
}
exports.apiCreateApplication = apiCreateApplication;
function apiCreateApplicationVersion(token, applicationName, params) {
    return new Promise((resolve, reject) => {
        (0, utils_1.callAPI)(`app/${applicationName}/version`, token, {
            name: params.name,
            req_cpu: params.req_cpu || 128,
            req_memory: params.req_memory || 256,
            docker_tag: params.docker_tag,
            docker_repository: params.docker_repository,
            docker_image: params.docker_image,
            private_username: params.private_username,
            private_token: params.private_token,
            ports: params.ports
        })
            .then(result => resolve(result))
            .catch(error => reject(error));
    });
}
exports.apiCreateApplicationVersion = apiCreateApplicationVersion;
function apiPatchApplicationVersion(token, applicationName, params) {
    return new Promise((resolve, reject) => {
        (0, utils_1.callAPI)(`app/${applicationName}/version/${params.name}`, token, {
            name: params.name,
            docker_tag: params.docker_tag,
            docker_repository: params.docker_repository,
            docker_image: params.docker_image,
            private_username: params.private_username,
            private_token: params.private_token
        }, 'patch')
            .then(result => resolve(result))
            .catch(error => reject(error));
    });
}
exports.apiPatchApplicationVersion = apiPatchApplicationVersion;
function apiDeployApplicationVersion(token, params) {
    return new Promise((resolve, reject) => {
        (0, utils_1.callAPI)(`deploy`, token, {
            app_name: params.app_name,
            version_name: params.version_name,
            location: params.location || { latitude: 50, longitude: 0 }
        })
            .then(result => resolve(result))
            .catch(error => reject(error));
    });
}
exports.apiDeployApplicationVersion = apiDeployApplicationVersion;
function apiStopDeployment(token, deploymentID) {
    return new Promise((resolve, reject) => {
        (0, utils_1.callAPI)(`stop/${deploymentID}`, token, undefined, 'delete')
            .then(result => resolve(result))
            .catch(error => reject(error));
    });
}
exports.apiStopDeployment = apiStopDeployment;
