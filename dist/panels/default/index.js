"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const utils_1 = require("../../shared/utils");
const package_json_1 = __importDefault(require("../../../package.json"));
const commander_1 = require("../../shared/commander");
const api_1 = require("../../shared/api");
// Used for keeping thack of the current deployment id, because it's used in more then one function.
let currentDeploymentID = '';
// Used to store the id of the deployment monitor timer.
let deploymentTimer = null;
module.exports = Editor.Panel.define({
    template: (0, fs_extra_1.readFileSync)((0, path_1.join)(__dirname, '../../../static/template/default/index.html'), 'utf-8'),
    style: (0, fs_extra_1.readFileSync)((0, path_1.join)(__dirname, '../../../static/style/default/index.css'), 'utf-8'),
    $: {
        taLog: "#ta-log",
        btnBuild: "#btn-build",
        btnDeploy: "#btn-deploy",
        btnStopDeploy: "#btn-stop-deploy",
        inpCmd: "#inp-cmd",
        inpRegistry: "#inp-registry",
        inpRepository: "#inp-repository",
        inpImage: "#inp-image",
        inpTag: "#inp-tag",
        inpToken: "#inp-token",
        inpRepoUsername: "#inp-repo-username",
        inpRepoToken: "#inp-repo-token",
        fileServer: "#file-server",
        lblStatus: "#lbl-status",
        linkIP: "#link-ip",
        linkFQDN: "#link-fqdn"
    },
    methods: {
        // Enable all input fields and buttons in the panel.
        enableAll() {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
            (_a = this.$.fileServer) === null || _a === void 0 ? void 0 : _a.removeAttribute('disabled');
            (_b = this.$.inpCmd) === null || _b === void 0 ? void 0 : _b.removeAttribute('disabled');
            (_c = this.$.inpRegistry) === null || _c === void 0 ? void 0 : _c.removeAttribute('disabled');
            (_d = this.$.inpRepository) === null || _d === void 0 ? void 0 : _d.removeAttribute('disabled');
            (_e = this.$.inpRepoUsername) === null || _e === void 0 ? void 0 : _e.removeAttribute('disabled');
            (_f = this.$.inpRepoToken) === null || _f === void 0 ? void 0 : _f.removeAttribute('disabled');
            (_g = this.$.inpToken) === null || _g === void 0 ? void 0 : _g.removeAttribute('disabled');
            (_h = this.$.inpImage) === null || _h === void 0 ? void 0 : _h.removeAttribute('disabled');
            (_j = this.$.inpTag) === null || _j === void 0 ? void 0 : _j.removeAttribute('disabled');
            (_k = this.$.btnBuild) === null || _k === void 0 ? void 0 : _k.removeAttribute('disabled');
            (_l = this.$.btnDeploy) === null || _l === void 0 ? void 0 : _l.removeAttribute('disabled');
            (_m = this.$.btnStopDeploy) === null || _m === void 0 ? void 0 : _m.removeAttribute('disabled');
        },
        // Disable all input fiels and buttons in the panel.
        disableAll() {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
            (_a = this.$.fileServer) === null || _a === void 0 ? void 0 : _a.setAttribute('disabled', '');
            (_b = this.$.inpCmd) === null || _b === void 0 ? void 0 : _b.setAttribute('disabled', '');
            (_c = this.$.inpRegistry) === null || _c === void 0 ? void 0 : _c.setAttribute('disabled', '');
            (_d = this.$.inpRepository) === null || _d === void 0 ? void 0 : _d.setAttribute('disabled', '');
            (_e = this.$.inpRepoUsername) === null || _e === void 0 ? void 0 : _e.setAttribute('disabled', '');
            (_f = this.$.inpRepoToken) === null || _f === void 0 ? void 0 : _f.setAttribute('disabled', '');
            (_g = this.$.inpToken) === null || _g === void 0 ? void 0 : _g.setAttribute('disabled', '');
            (_h = this.$.inpImage) === null || _h === void 0 ? void 0 : _h.setAttribute('disabled', '');
            (_j = this.$.inpTag) === null || _j === void 0 ? void 0 : _j.setAttribute('disabled', '');
            (_k = this.$.btnBuild) === null || _k === void 0 ? void 0 : _k.setAttribute('disabled', '');
            (_l = this.$.btnDeploy) === null || _l === void 0 ? void 0 : _l.setAttribute('disabled', '');
            (_m = this.$.btnStopDeploy) === null || _m === void 0 ? void 0 : _m.setAttribute('disabled', '');
        },
        async buildAndPush() {
            const serverDir = this.$.fileServer.value;
            const buildCmd = this.$.inpCmd.value;
            const registry = this.$.inpRegistry.value;
            const repository = this.$.inpRepository.value;
            const image = this.$.inpImage.value;
            const tag = this.$.inpTag.value;
            const token = this.$.inpToken.value;
            utils_1.logger.clear();
            try {
                const serverBuildResult = await (0, commander_1.executeServerBuild)(serverDir, buildCmd);
                if (serverBuildResult.code != 0)
                    return;
            }
            catch (error) {
                utils_1.logger.add(`Catched error: ${error.message}.`);
                return;
            }
            const url = `${registry}/${repository}/${image}${tag.length == 0 ? "" : `:${tag}`}`;
            const containerName = (0, utils_1.makeContainerNameFromURL)(url);
            try {
                const buildResult = await (0, commander_1.executeDockerBuild)(url, serverDir);
                if (buildResult.code != 0)
                    return;
                utils_1.logger.addBreak().add("Testing the image...");
                const startResult = await (0, commander_1.executeDockerRun)(url, containerName);
                if (startResult.code == 0 && !startResult.exited) {
                    const stopResult = await (0, commander_1.executeDockerStop)(containerName);
                    if (stopResult.code != 0)
                        return;
                }
                const removeContainerResult = await (0, commander_1.executeDockerRemove)(containerName);
                if (removeContainerResult.code != 0)
                    return;
                if (startResult.code != 0) { // errors when starting, remove invalid image
                    await (0, commander_1.executeDockerRemoveImage)(url);
                    return;
                }
                const pushResult = await (0, commander_1.executeDockerPush)(url);
                if (pushResult.code != 0)
                    return;
            }
            catch (error) {
                utils_1.logger.add(`Catched Error: ${error.message}.`);
                return;
            }
            // if building and pushing were successful, proceed to app creation
            utils_1.logger.addBreak().add('Creating application...').addBreak();
            const repoUsername = this.$.inpRepoUsername.value;
            const repoToken = this.$.inpRepoToken.value;
            const appName = (0, utils_1.makeApplicationNameFromImage)(image);
            try {
                const result = await (0, api_1.apiCreateApplication)(token, { name: appName });
                if (result.status === 200) {
                    utils_1.logger.add(`Successfully created ${appName}.`);
                }
                else if (result.status == 409) {
                    utils_1.logger.add(`Can't create an ${appName}, already exists! Skipping...`);
                    // don't worry, proceed
                }
                else {
                    utils_1.logger.add(`Creating app failed. Status: ${result.status} Message: ${result.data.message}`);
                    return;
                }
            }
            catch (error) {
                utils_1.logger.add(`Internal Error: ${error.message}`);
                return;
            }
            const tagName = tag.length === 0 ? 'latest' : tag;
            try {
                let result = await (0, api_1.apiCreateApplicationVersion)(token, appName, {
                    name: tagName,
                    docker_tag: tagName,
                    docker_repository: registry,
                    docker_image: `${repository}/${image}`,
                    private_username: repoUsername,
                    private_token: repoToken,
                    ports: [
                        {
                            name: "default",
                            port: 7777,
                            protocol: "TCP"
                        }
                    ]
                });
                if (result.status === 200) {
                    utils_1.logger.add(`Successfully uploaded version ${tagName} to the ${appName}.`);
                    return;
                }
                else if (result.status !== 409) {
                    utils_1.logger.add(`Uploading version ${tagName} failed. Status: ${result.status} Message: ${result.data.message}`);
                    return;
                }
                // status is 409, retry with patch
                result = await (0, api_1.apiPatchApplicationVersion)(token, appName, {
                    name: tagName,
                    docker_tag: tagName,
                    docker_repository: registry,
                    docker_image: `${repository}/${image}`,
                    private_username: repoUsername,
                    private_token: repoToken
                });
                if (result.status === 200) {
                    utils_1.logger.add(`Successfully patched ${tagName} version for app ${appName}.`);
                }
                else {
                    utils_1.logger.add(`Updating existing version ${tagName} failed. Status: ${result.status} Message: ${result.data.message}`);
                }
            }
            catch (error) {
                utils_1.logger.add(`Catched Error: ${error.message}`);
            }
        },
        async deploy(onProgress = (data) => { }, onComplete = (error) => { }) {
            const image = this.$.inpImage.value;
            const tag = this.$.inpTag.value;
            const token = this.$.inpToken.value;
            utils_1.logger.addBreak().add("Deploying the application...");
            currentDeploymentID = '';
            clearInterval(deploymentTimer);
            try {
                const result = await (0, api_1.apiDeployApplicationVersion)(token, {
                    app_name: (0, utils_1.makeApplicationNameFromImage)(image),
                    version_name: tag.length == 0 ? "latest" : tag
                });
                if (result.status !== 200) {
                    utils_1.logger.add(`Deploying application ${image}-app failed.\nStatus ${result.status}. Message: ${result.data.message}.`);
                    onComplete(result.data);
                    return;
                }
                currentDeploymentID = result.data.request_id;
                this.monitorDeployment((data) => {
                    onProgress(data);
                    if (data.current_status_label === "Ready") {
                        utils_1.logger.add("Successfully deployed the application.");
                        clearInterval(deploymentTimer);
                        onComplete();
                    }
                }, (error) => {
                    onComplete(error);
                });
            }
            catch (error) {
                utils_1.logger.add(`Catched Error: ${error.message}`);
                onComplete(error);
            }
        },
        async stopDeployment(onProgress = (data) => { }, onComplete = (error) => { }) {
            const token = this.$.inpToken.value;
            utils_1.logger.addBreak().add("Stopping the deployment...");
            clearInterval(deploymentTimer);
            try {
                const result = await (0, api_1.apiStopDeployment)(token, currentDeploymentID);
                if (result.status !== 200 && result.status !== 202) {
                    utils_1.logger.add(`Stopping deployment with ID ${currentDeploymentID} failed.\nStatus: ${result.status}. Message: ${result.data.message}`);
                    onComplete(result.data);
                    return;
                }
                this.monitorDeployment((data) => {
                    onProgress(data.current_status_label);
                    if (data.current_status_label === "Terminated") {
                        utils_1.logger.add("Successfully stopped the deployment.");
                        clearInterval(deploymentTimer);
                        onComplete();
                    }
                }, (error) => {
                    onComplete(error);
                });
            }
            catch (error) {
                utils_1.logger.add(`Catched Error: ${error.message}`);
                onComplete(error);
            }
        },
        monitorDeployment(onData = (data) => { }, onError = (error) => { }) {
            const token = this.$.inpToken.value;
            clearInterval(deploymentTimer);
            deploymentTimer = setInterval(async () => {
                try {
                    const result = await (0, utils_1.callAPI)(`status/${currentDeploymentID}`, token, undefined, 'get');
                    if (result.status !== 200) {
                        utils_1.logger.add(`Deployment #${currentDeploymentID} monitor failed with status ${result.status}.`);
                        clearInterval(deploymentTimer);
                        onError(result.data);
                        return;
                    }
                    const portText = result.data.ports && result.data.ports.default ? ':' + result.data.ports.default.external : '';
                    // update the label values in the panel
                    this.$.linkIP.textContent = result.data.public_ip ? result.data.public_ip : '-';
                    this.$.linkFQDN.textContent = result.data.fqdn ? result.data.fqdn + portText : '-';
                    this.$.lblStatus.textContent = `Status of deployment: ${result.data.current_status_label}`;
                    onData(result.data);
                }
                catch (error) {
                    utils_1.logger.add(`Catched Error: ${error.message}`);
                    clearInterval(deploymentTimer);
                    onError(error);
                }
            }, 500);
        },
        // Callback for the build button
        async onBuildButtonClicked() {
            this.disableAll();
            await this.buildAndPush();
            this.enableAll();
        },
        // Callback for the deploy button
        onDeployButtonClicked() {
            var _a, _b;
            this.disableAll();
            (_a = this.$.btnDeploy) === null || _a === void 0 ? void 0 : _a.classList.add('hidden');
            (_b = this.$.btnStopDeploy) === null || _b === void 0 ? void 0 : _b.classList.remove('hidden');
            this.deploy((data) => {
                var _a;
                (_a = this.$.btnStopDeploy) === null || _a === void 0 ? void 0 : _a.removeAttribute('disabled');
            }, (error) => {
                var _a, _b;
                if (error) {
                    if (!currentDeploymentID || currentDeploymentID.length == 0) {
                        // switch back to deploy button, if deployment wasn't successful
                        (_a = this.$.btnDeploy) === null || _a === void 0 ? void 0 : _a.classList.remove('hidden');
                        (_b = this.$.btnStopDeploy) === null || _b === void 0 ? void 0 : _b.classList.add('hidden');
                    }
                    this.enableAll();
                }
            });
        },
        // Callback for the stop button
        onStopDeployButtonClicked() {
            this.disableAll();
            this.stopDeployment(() => { }, (error) => {
                var _a, _b;
                currentDeploymentID = '';
                this.$.linkIP.textContent = `-`;
                this.$.linkFQDN.textContent = `-`;
                // show deploy button instead of stop after stopping
                (_a = this.$.btnDeploy) === null || _a === void 0 ? void 0 : _a.classList.remove('hidden');
                (_b = this.$.btnStopDeploy) === null || _b === void 0 ? void 0 : _b.classList.add('hidden');
                this.enableAll();
            });
        }
    },
    async ready() {
        var _a, _b, _c, _d, _e;
        // disable everything for the loading time
        this.disableAll();
        utils_1.logger.assign(this.$.taLog);
        utils_1.logger.clear();
        // load the stored values from the extension configuration
        this.$.fileServer.value = await getConfig('serverDir') || "";
        this.$.inpCmd.value = await getConfig('buildCmd') || "";
        this.$.inpRegistry.value = await getConfig('registry') || "";
        this.$.inpRepository.value = await getConfig('repository') || "";
        this.$.inpImage.value = await getConfig('image') || "";
        this.$.inpToken.value = await getConfig('token') || "";
        this.$.inpTag.value = await getConfig('tag') || "";
        this.$.inpRepoUsername.value = await getConfig('repoUsername') || "";
        this.$.inpRepoToken.value = await getConfig('repoToken') || "";
        // assign button callbacks
        (_a = this.$.btnBuild) === null || _a === void 0 ? void 0 : _a.addEventListener('confirm', this.onBuildButtonClicked.bind(this));
        (_b = this.$.btnDeploy) === null || _b === void 0 ? void 0 : _b.addEventListener('confirm', this.onDeployButtonClicked.bind(this));
        (_c = this.$.btnStopDeploy) === null || _c === void 0 ? void 0 : _c.addEventListener('confirm', this.onStopDeployButtonClicked.bind(this));
        // check for existing, tracked deployment
        const deploymentID = await getConfig('deploymentID');
        if (!deploymentID) {
            this.enableAll();
            return;
        }
        utils_1.logger.add(`Starting monitoring saved deployment with ID ${deploymentID}...`);
        (_d = this.$.btnDeploy) === null || _d === void 0 ? void 0 : _d.classList.add('hidden');
        (_e = this.$.btnStopDeploy) === null || _e === void 0 ? void 0 : _e.classList.remove('hidden');
        currentDeploymentID = deploymentID;
        this.monitorDeployment((data) => {
            var _a, _b, _c, _d;
            if (data.current_status_label === "Terminated") {
                // put back the default state if the current deployment terminates
                currentDeploymentID = '';
                this.$.linkIP.textContent = `-`;
                this.$.linkFQDN.textContent = `-`;
                (_a = this.$.btnDeploy) === null || _a === void 0 ? void 0 : _a.classList.remove('hidden');
                (_b = this.$.btnStopDeploy) === null || _b === void 0 ? void 0 : _b.classList.add('hidden');
                this.enableAll();
            }
            else if (data.current_status_label === "Ready") {
                // enable stop button if the deployment is successful
                (_c = this.$.btnStopDeploy) === null || _c === void 0 ? void 0 : _c.removeAttribute('disabled');
            }
            else {
                if (data.current_status_label !== "Terminating") {
                    // also enable stop button if the deployment is in progress, but no terminating
                    (_d = this.$.btnStopDeploy) === null || _d === void 0 ? void 0 : _d.removeAttribute('disabled');
                }
                return;
            }
            // stop monitoring after successful termination or deployment.
            clearInterval(deploymentTimer);
        }, (error) => {
            var _a, _b;
            // bring back the default state if any internal error appears.
            currentDeploymentID = '';
            (_a = this.$.btnDeploy) === null || _a === void 0 ? void 0 : _a.classList.remove('hidden');
            (_b = this.$.btnStopDeploy) === null || _b === void 0 ? void 0 : _b.classList.add('hidden');
            this.enableAll();
        });
    },
    async beforeClose() {
        // save all the input fields into the configuration
        await setConfig('serverDir', this.$.fileServer.value);
        await setConfig('buildCmd', this.$.inpCmd.value);
        await setConfig('registry', this.$.inpRegistry.value);
        await setConfig('repository', this.$.inpRepository.value);
        await setConfig('image', this.$.inpImage.value);
        await setConfig('token', this.$.inpToken.value);
        await setConfig('tag', this.$.inpTag.value);
        await setConfig('repoUsername', this.$.inpRepoUsername.value);
        await setConfig('repoToken', this.$.inpRepoToken.value);
        await setConfig('deploymentID', currentDeploymentID);
        clearInterval(deploymentTimer);
    },
    close() { }
});
// helper functions to not clutter the main script
async function getConfig(name) {
    return await Editor.Profile.getConfig(package_json_1.default.name, name, 'local');
}
async function setConfig(name, value) {
    await Editor.Profile.setConfig(package_json_1.default.name, name, value, 'local');
}
