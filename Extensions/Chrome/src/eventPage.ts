import { REPO_OWNER, REPO_NAME, API_ADDRESS } from "./popup/Popup";
import { compare } from "compare-versions";
import { getLocalStorageValue, getDateTimeInSeconds, githubDarkThemeStorageV1Format } from "./shared";

chrome.runtime.onInstalled.addListener(function () {
    console.log("Setting up first install");

    tryInstallOrUpdate();

    //alert("Extension Installed");
});

chrome.runtime.onUpdateAvailable.addListener(function callback(details) {

    chrome.runtime.reload();
});

chrome.runtime.onConnect.addListener(function () {
    enableTheme();
    injectTheme();
});

const ALARM_NAME = "GithubDarkThemeCheckForUpdate";
const ALARM_DELAY_IN_MINUTES = 60 * 4;  // 6 times a day
chrome.alarms.create(ALARM_NAME, { when: Date.now(), periodInMinutes: ALARM_DELAY_IN_MINUTES })

chrome.alarms.onAlarm.addListener(function callback(alarm) {
    if (alarm.name === ALARM_NAME) {
        tryInstallOrUpdate();
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // onMessage must return "true" if response is async.
    let isResponseAsync = false;

    if (request.popupMounted) {
        console.log("eventPage notified that Popup.tsx has mounted.");
    }
    else if (!request.themeEnabled) {
        disableTheme();
    }
    else if (request.themeEnabled) {
        enableTheme();
    }

    return isResponseAsync;
});

async function disableTheme() {
    const storageObject = await getLocalStorageValue();
    storageObject.disabled = true;
    chrome.storage.local.set({ "GithubDarkThemeStorageV1": storageObject }, () => {
        removeInjectedTheme();
    });
    console.log("background: disableTheme completed!")
};

async function enableTheme() {
    const storageObject = await getLocalStorageValue();
    storageObject.disabled = false;
    chrome.storage.local.set({ "GithubDarkThemeStorageV1": storageObject }, () => {
        injectTheme();
    });
    console.log("background: enableTheme completed!")
};

async function tryInstallOrUpdate() {
    console.log("getLatestRelease!");

    getLatestReleaseVersion().then(latestReleaseVersion => {
        if (needsInstallOrUpdate(latestReleaseVersion)) {
            installVersionOfTheme();
        }
    });
}

const semRegex = "^[0-9]*\.[0-9]*\..*"

async function getLatestReleaseVersion(): Promise<string> {
    const response = await fetch(API_ADDRESS + `repos/${REPO_OWNER}/${REPO_NAME}/releases`);
    const releaseData = await response.json() as any[];

    for (let index = 0; index < releaseData.length; index++) {
        const element = (releaseData[index].tag_name as string).match(semRegex);
        if (element.length > 0) {
            return releaseData[index].tag_name;
        }
    }
    return undefined;
};

async function installVersionOfTheme() {
    console.log(`repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`);
    const releaseVersion = await getLatestReleaseVersion();
    const themeData = await getThemeCss(releaseVersion);
    const storageObject = {
        installedVersion: releaseVersion,
        LastUpdateCheckedTime: getDateTimeInSeconds(),
        theme: themeData,
        disabled: false
    };

    chrome.storage.local.set({ "GithubDarkThemeStorageV1": storageObject }, () => {
        injectTheme();
    });
}

async function getThemeCss(tagVersion: string): Promise<string> {
    const response = await fetch(`https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${tagVersion}/Theme.css`);
    const themeData = await response.text();
    return themeData;
}

async function needsInstallOrUpdate(latestReleaseVersion: string): Promise<boolean> {
    console.log('determineNeedsUpdate!');
    const storageObject = (await getLocalStorageValue()) as githubDarkThemeStorageV1Format;
    if (storageObject.disabled === true) {
        return false;
    }
    if (storageObject.installedVersion === '' || storageObject.installedVersion === undefined) {
        return true;
    }
    else if (latestReleaseVersion === undefined) {
        console.error('latest version is undefined but should have value');
    }
    else {
        console.log('start compare');
        console.log(latestReleaseVersion + storageObject.installedVersion);
        return compare(latestReleaseVersion, storageObject.installedVersion, '>');
    }
}

function injectTheme() {
    chrome.tabs.query(urlRegexMatch, tabs => {
        tabs.forEach(tab => {
            chrome.tabs.executeScript(tab.id, {
                code: `
            var evt = document.createEvent('Event');
            evt.initEvent('injectTheme', true, false);

            // fire the event
            document.dispatchEvent(evt);
            ` })
        });
    })
    console.log("Theme inject event sent");
};

function removeInjectedTheme() {
    chrome.tabs.query(urlRegexMatch, tabs => {
        tabs.forEach(tab => {
            chrome.tabs.executeScript(tab.id, {
                code: `
            var evt = document.createEvent('Event');
            evt.initEvent('removeTheme', true, false);

            // fire the event
            document.dispatchEvent(evt);
            ` })
        });
    })
    console.log("remove injected theme event sent");
};

const urlRegexMatch: chrome.tabs.QueryInfo = {
    url: ["*://*.github.com/*",
        "*://*.github.com/",
        "*://github.com/",
        "*://github.com/*"]
};

