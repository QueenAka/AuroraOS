// TODO: ... This ... Uhm ... Yea
function toggleMenu(type) {
  document.querySelectorAll("menu").forEach((menu) => {
    if (!menu.classList.contains(type)) menu.classList.remove("open");
  });
  const startMenu = document.querySelector(`.${type}`);
  startMenu.classList.toggle("open");
}

// TODO: And this, holy shit 😨
setInterval(() => {
  const date = new Date();
  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  document.querySelector("#widget_time").innerText = time;
}, 500);

class AppHost {
  #iframes = new Map();
  #permissions = new Map();
  constructor() {
    window.addEventListener("message", this.#handleMessage.bind(this));
  }

  registerApp(appId, iframe, permissions = [], data = null) {
    if (!iframe || !(iframe instanceof HTMLIFrameElement)) {
      this.notify(
        {
          title: "App register failed",
          desc: `Failed to register app, some features may not function`,
        },
        "error"
      );
      throw new Error("Invalid iframe provided.");
    }
    this.#iframes.set(appId, iframe);
    this.#permissions.set(appId, permissions);
    iframe.onload = () => {
      iframe.contentWindow?.postMessage(
        {
          event: "sendId",
          data: {
            appId,
            permissions,
          },
        },
        "*"
      );
      iframe.contentWindow?.postMessage(
        {
          event: data?.type,
          data: data?.data,
        },
        "*"
      );
    };
  }

  unregisterApp(appId) {
    this.#iframes.delete(appId);
    this.#permissions.delete(appId);
  }

  sendEventToApp(appId, eventId) {
    const iframe = this.#iframes.get(appId);
    if (!iframe) throw new Error(`App with ID "${appId}" not found.`);
    iframe.contentWindow?.postMessage(
      {
        event: "customEvent",
        data: eventId,
      },
      "*"
    );
  }

  broadcastEvent(eventId) {
    for (const [appId, iframe] of this.#iframes) {
      // Why are we getting appId?
      iframe.contentWindow?.postMessage(
        {
          event: "customEvent",
          data: eventId,
        },
        "*"
      );
    }
  }

  #handleMessage(e) {
    const { appId, type, data } = e.data;
    if (!appId || !this.#iframes.has(appId)) return;
    switch (type) {
      case "log":
        console.log(`[App ${appId}]`, data);
        break;
      case "open":
        system.openItem(data.path);
        break;
      case "saveFilePopup":
        console.log("saveFilePopup:", data);
        // Proper openItem usage!!! Woohoo!!!
        system.openItem("/apps/files.cln3", {
          type: "saveFile",
          data: data,
        });
        break;
      default:
        console.warn(`Unhandled message type from app ${appId}:`, type);
    }
  }
}

// This whole thing was PAINFUL to get working, deff worth tho
class FileSystem {
  constructor() {
    this.dbName = "AuroraOS";
    this.storeName = "root";
    this.dbPromise = this.init();
  }

  async init() {
    const response = await fetch("./scripts/fs.json");
    const data = await response.json();
    this.defaultFS = data.fs;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        db.createObjectStore(this.storeName);
      };

      req.onsuccess = async () => {
        const db = req.result;
        const tx = db.transaction(this.storeName, "readonly");
        const store = tx.objectStore(this.storeName);
        const countReq = store.count();
        countReq.onsuccess = async () => {
          if (countReq.result === 0) {
            const txInit = db.transaction(this.storeName, "readwrite");
            const storeInit = txInit.objectStore(this.storeName);
            for (const [path, content] of Object.entries(this.defaultFS)) {
              storeInit.put(content, path);
            }

            txInit.oncomplete = () => resolve(db);
            txInit.onerror = () => reject(txInit.error);
          } else {
            resolve(db);
          }
        };

        countReq.onerror = () => reject(countReq.error);
      };

      req.onerror = () => reject(req.error);
    });
  }

  async get(path) {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readonly");
      const req = tx.objectStore(this.storeName).get(path);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async put(path, json) {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite");
      const req = tx.objectStore(this.storeName).put(json, path);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async delete(path) {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite");
      const req = tx.objectStore(this.storeName).delete(path);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async list(prefix = "") {
    // Updated so that it doesnt give children of folders, sorry Rina
    const db = await this.dbPromise;
    if (prefix && !prefix.endsWith("/")) prefix += "/";
    return new Promise(async (resolve, reject) => {
      const tx = db.transaction(this.storeName, "readonly");
      const store = tx.objectStore(this.storeName);
      if (prefix !== "/" && prefix !== "") {
        const parentPath = prefix.slice(0, -1);
        const parentCheck = store.get(parentPath);
        parentCheck.onsuccess = () => {
          const result = parentCheck.result;
          if (!result || result.type !== "dir") {
            resolve(null);
          } else {
            listChildren();
          }
        };

        parentCheck.onerror = () => reject(parentCheck.error);
      } else {
        listChildren();
      }

      function listChildren() {
        const keys = [];
        const req = store.openCursor();
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            const key = cursor.key;
            if (key.startsWith(prefix)) {
              const rest = key.slice(prefix.length);
              if (rest && !rest.includes("/")) {
                keys.push(key);
              }
            }
            cursor.continue();
          } else {
            resolve(keys);
          }
        };

        req.onerror = () => reject(req.error);
      }
    });
  }

  async reset() {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite");
      const store = tx.objectStore(this.storeName);
      const clearReq = store.clear();
      clearReq.onsuccess = async () => {
        const response = await fetch("./scripts/fs.json");
        const data = await response.json();
        const defaultFS = data.fs;
        const txRepopulate = db.transaction(this.storeName, "readwrite");
        const storeRepopulate = txRepopulate.objectStore(this.storeName);
        for (const [path, content] of Object.entries(defaultFS)) {
          storeRepopulate.put(content, path);
        }

        // Reload because for some reason it fucks up if apps are open after reset
        txRepopulate.oncomplete = () => {
          resolve();
          window.location.reload();
        };
        txRepopulate.onerror = () => {
          reject(txRepopulate.error);
          window.location.reload();
        };
      };

      clearReq.onerror = () => {
        reject(clearReq.error);
        window.location.reload();
      };
    });
  }
}

class System {
  constructor() {
    this.ready = this.init();
  }

  // el gato MUY preñado
  // ... Huh?

  async init() {
    this.fs = new FileSystem();
    this.appHandler = new AppHost();
    const response = await fetch("./scripts/settings.json");
    const data = await response.json();
    this.settings =
      JSON.parse(localStorage.getItem("settings")) || data.settings;
    this.bootTime = Date.now(); // For uptime
    // Preload notif audios for better playback
    let supportedNotifTypes = ["info", "error", "success", "warn"];
    this.audioMap = {};
    supportedNotifTypes.concat("unknown").forEach((type) => {
      const audio = new Audio(`./media/notif/${type}.wav`);
      audio.preload = "auto";
      this.audioMap[type] = audio;
    });
    this.openedApps = {};
  }

  async setup() {
    await this.ready;
    await this.loadDesktop();
    this.loadToolbar();
    console.log(`System booted in ${Date.now() - this.bootTime}ms`);
    document.querySelector("load").style.opacity = 0;
    setTimeout(() => {
      document.querySelector("load").remove();
    }, 150);
  }

  async loadDesktop() {
    const desktopFolder = await this.fs.list("/desktop");
    const desktop = document.querySelector("main");
    desktop.innerHTML = "";
    desktopFolder.forEach(async (key) => {
      if (key == "/desktop") return;
      const appData = await this.fs.get(key);
      const item = document.createElement("div");
      item.classList.add("item");
      const icon = document.createElement("div");
      icon.classList.add("icon");
      const supportedTypes = [
        "txt",
        "img",
        "vid",
        "aud",
        "zip",
        "lnk",
        "dir",
        "app",
      ];
      icon.style = "--url: url(../media/appIcons/" + appData.type + ".svg)";
      if (!supportedTypes.includes(appData.type))
        icon.style = "--url: url(../media/appIcons/bin.svg)";

      if (appData.type === "lnk") {
        // TODO: Make this get the app icon if linkType is "app"
        const linkType = this.fsObjectFromPath(appData.cont).type;
        icon.style = "--url: url(../media/appIcons/" + linkType + ".svg)";
      }

      if (appData.type === "app" && typeof appData.cont !== "string") {
        // NOTE: Consider making a icon loader method for apps
        const appFiles = await this.unpackageApp(appData.cont);
        const meta = JSON.parse(await appFiles.get("/meta.json").text());
        if (meta.icon) {
          const iconFile = appFiles.get("/" + meta.icon);
          if (iconFile) {
            const reader = new FileReader();
            reader.onload = () => {
              const base64 = reader.result;
              icon.style = "--url: url(" + base64 + ")";
            };
            reader.readAsDataURL(iconFile);
          }
        }
      }
      item.ondblclick = () => this.openItem(key);
      const name = document.createElement("div");
      name.classList.add("text");
      name.innerText = key.replace("/desktop/", "");
      item.appendChild(icon);
      item.appendChild(name);
      desktop.appendChild(item);
    });
  }

  loadToolbar() {
    document.querySelectorAll("nav .group.left .open-app").forEach((thing) => {
      thing.remove();
    });
    Object.entries(this.openedApps).forEach(([appId, app]) => {
      const appDiv = document.createElement("div");
      appDiv.classList.add("open-app");
      appDiv.style = `--url: url(${app.icon})`;
      appDiv.onclick = () => {
        const appFrame = document.getElementById(appId);
        appFrame.classList.toggle("min");
      };
      document.querySelector("nav .group.left").appendChild(appDiv);
    });
  }

  async unpackageApp(data) {
    if (!data) {
      this.notify(
        {
          title: "Failed to load app",
          desc: "No package data was found, might be an invalid file",
        },
        "error"
      );
      return;
    }

    const mimeTypes = {
      svg: "image/svg+xml",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      ico: "image/x-icon",
      json: "application/json",
      js: "application/javascript",
      css: "text/css",
      html: "text/html",
      txt: "text/plain",
      md: "text/markdown",
    };

    const zipFileMap = new Map();
    const byteArray = new Uint8Array(data);
    const file = new Blob([byteArray], { type: "application/zip" });
    const zip = await JSZip.loadAsync(file);
    zipFileMap.clear();

    for (const filename in zip.files) {
      const fileObj = zip.files[filename];
      if (!fileObj.dir) {
        const ext = filename.split(".").pop().toLowerCase();
        const mime = mimeTypes[ext] || "application/octet-stream";
        const buffer = await fileObj.async("arraybuffer");
        const blob = new Blob([buffer], { type: mime });
        zipFileMap.set("/" + filename, blob);
      }
    }

    return zipFileMap;
  }

  // Should only be called inside openItem for type handling
  async openApp(path, data) {
    const appId = Date.now();
    let appObj;
    if (typeof path != "object") appObj = await this.fs.get(path);
    else appObj = path;
    const appFiles = await this.unpackageApp(appObj.cont);
    // I have no clue how service workers work, thanks Rina for doing this ♥
    // No problem :P
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "SET_FILES",
        files: Array.from(appFiles.entries()),
      });
    } else {
      await navigator.serviceWorker.register("./scripts/sw.js");
      navigator.serviceWorker.ready.then((registration) => {
        registration.active.postMessage({
          type: "SET_FILES",
          files: Array.from(appFiles.entries()),
        });
      });
    }

    const appHolder = document.createElement("div");
    appHolder.classList.add("app");
    const app = document.createElement("iframe");
    const appName = document.createElement("div");
    appName.classList.add("name");
    let appIcon;
    const meta = await appFiles.get("/meta.json").text();
    const metaData = JSON.parse(meta);
    if (metaData.icon) {
      const iconFile = appFiles.get("/" + metaData.icon);
      if (iconFile) {
        appIcon = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve(reader.result);
          };
          reader.readAsDataURL(iconFile);
        });
      }
    } else {
      appIcon = "../media/appIcons/app.svg";
    }
    if (!appIcon) appIcon = "../media/appIcons/app.svg";
    appName.innerText = metaData.name;
    const appButtons = document.createElement("div");
    appButtons.classList.add("buttons");
    const minButton = document.createElement("div");
    minButton.classList.add("button");
    minButton.style = "--url: url(../media/window/min.svg)";
    minButton.onclick = () => {
      appHolder.classList.toggle("min");
    };
    const zoomButton = document.createElement("div");
    zoomButton.classList.add("button");
    zoomButton.style = "--url: url(../media/window/zoom.svg)";
    zoomButton.onclick = () => {
      if (appHolder.classList.contains("max")) {
        appHolder.classList.remove("max");
        zoomButton.style = "--url: url(../media/window/zoom.svg)";
      } else {
        appHolder.classList.add("max");
        zoomButton.style = "--url: url(../media/window/unzoom.svg)";
      }
    };
    const closeButton = document.createElement("div");
    closeButton.classList.add("button");
    closeButton.style = "--url: url(../media/window/close.svg)";
    closeButton.onclick = () => {
      appHolder.style.animation = "fade-out 0.1s ease-in-out forwards";
      setTimeout(() => {
        appHolder.remove();
        delete this.openedApps[appId];
        this.loadToolbar();
        this.appHandler.unregisterApp(appId);
      }, 220);
    };
    appButtons.appendChild(minButton);
    appButtons.appendChild(zoomButton);
    appButtons.appendChild(closeButton);
    appHolder.appendChild(appButtons);
    appHolder.appendChild(appName);
    appHolder.appendChild(app);
    appHolder.id = appId;
    if (metaData.display?.size) {
      const size = metaData.display?.size.replace("px", "").split("x");
      appHolder.style.width = size[0] + "px";
      appHolder.style.height = size[1] * 1 + 30 + "px"; // bcuz window nav is 30 px tall mhm
    }

    if (metaData.display?.openFullscreen) appHolder.classList.add("max");
    if (metaData.display?.resize === false) {
      zoomButton.remove();
      appHolder.classList.remove("max"); // Incase both flags were called
      // dont want unshrinkable fullscreen apps
    }
    setTimeout(() => {
      document.querySelector("main").appendChild(appHolder);
      app.src = "/index.html";
      makeDraggable(appHolder, metaData.display?.resize ?? true);
    }, 1000);
    this.openedApps[appId] = { icon: appIcon, name: metaData.name };
    this.loadToolbar();
    this.appHandler.registerApp(appId, app, [], data);
  }

  async notify(json, type = "info", dur = 5000) {
    if (!json.title) return console.error("Notification must have a title");
    if (!json.desc)
      return console.error("Notification must have a description");
    const supportedTypes = ["info", "error", "success", "warn"];
    const notification = document.createElement("div");
    notification.classList.add("notif");
    const notifIcon = document.createElement("div");
    notifIcon.classList.add("icon");
    notifIcon.style = "--url: url(../media/notif/" + type + ".svg)";
    const title = document.createElement("div");
    title.classList.add("title");
    title.innerText = json.title;
    const desc = document.createElement("div");
    desc.classList.add("desc");
    desc.innerText = json.desc;
    notification.appendChild(title);
    notification.appendChild(desc);
    if (!supportedTypes.includes(type))
      notifIcon.style = "--url: url(../media/notif/unknown.svg)";
    notification.appendChild(notifIcon);
    const audioType = supportedTypes.includes(type) ? type : "unknown";
    const aud = this.audioMap[audioType];
    const playAudio = aud.cloneNode();
    try {
      await playAudio.play();
    } catch (e) {
      console.warn("Audio play failed:", e);
    }
    document.body.appendChild(notification);
    setTimeout(() => {
      notification.classList.add("fade");
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 200);
    }, dur);
  }

  // openItem should be the only method to call openApp
  async openItem(path) {
    let item = await this.fs.get(path);
    if (item.type === "lnk") {
      const target = this.fsObjectFromPath(item.cont);
      if (target) {
        this.openItem(target);
      } else {
        this.notify(
          {
            title: "File not found",
            desc: `The linked file "${
              item.cont.split("/").slice(-1)[0]
            }" was not found`,
          },
          "error"
        );
      }
    } else if (item.type === "app") {
      if (typeof item.cont === "string") {
        if (item.cont?.startsWith("JS:")) {
          const conf = confirm(
            "This app want to execute JS code that may be unsafe. Do you want to continue?"
          );
          if (conf) {
            const code = item.cont.substring(3);
            eval(code);
          }
          return;
        } else if (item.cont?.startsWith("LD:")) {
          const url = item.cont.substring(3);
          fetch(url)
            .then((res) => res.arrayBuffer())
            .then(async (arrayBuffer) => {
              item.cont = arrayBuffer;
              await this.fs.put(path, item);
              this.openApp(item);
            })
            .catch((error) => {
              console.error("Failed to fetch ZIP:", error);
              this.notify(
                {
                  title: "Invalid .cln3",
                  desc: "Could not unpack file, it may be an invalid package",
                },
                "error"
              );
            });
          return;
        }
      }
      this.openApp(item);
    } else if (item.type === "txt") {
      this.openItem("/apps/notepad.cln3", item);
    } else if (
      item.type === "img" ||
      item.type === "vid" ||
      item.type === "aud"
    ) {
      this.openItem("/apps/media.cln3", item);
    } else if (item.type === "dir" || item.type === "zip") {
      this.openItem("/apps/files.cln3", item);
    } else {
      // Shouldnt really ever happen, but its possible
      this.notify(
        {
          title: "Unsupported file",
          desc: `The file type "${item.type}" is unsupported and cannot be opened`,
        },
        "error"
      );
    }
  }

  async getStorage() {
    if (!navigator.storage?.estimate) {
      // warn the user their browser is ass lmfao
      this.notify(
        {
          title: "Cannot calculate storage",
          desc: "Your browser does not support the storage API",
        },
        "warn"
      );
      throw new Error("Storage estimation not supported in this browser.");
    }

    function formatBytes(bytes) {
      const units = ["bytes", "KB", "MB", "GB", "TB", "PB"]; // we got a good 10 yrs before this goes beyond
      let i = 0;

      while (bytes >= 1024 && i < units.length - 1) {
        bytes /= 1024;
        i++;
      }

      return `${bytes.toFixed(2)} ${units[i]}`;
    }

    const estimate = await navigator.storage.estimate();
    const used = estimate.usage;
    const quota = estimate.quota;
    const remaining = quota - used;

    return {
      used: formatBytes(used),
      limit: formatBytes(quota),
      remaining: formatBytes(remaining),
      percent: (used / quota) * 100, // Send as int with * 1 bcuz parseInt is ass
      exact: [used, quota],
    };
  }
}

function makeDraggable(elm, shouldResize = true) {
  // Center the window
  elm.style.left = `${(window.innerWidth - elm.offsetWidth) / 2}px`;
  elm.style.top = `${(window.innerHeight - elm.offsetHeight) / 2}px`;
  elm.setAttribute("data-x", 0);
  elm.setAttribute("data-y", 0);
  const minWidth = elm.querySelector(".name").offsetWidth + 100;

  const interaction = interact(elm).draggable({
    modifiers: [
      interact.modifiers.restrictRect({
        restriction: "parent",
      }),
    ],
    listeners: {
      start() {
        if (elm.classList.contains("max")) return;
        document
          .querySelectorAll(".app")
          .forEach((app) => (app.style.zIndex = 998));
        elm.style.zIndex = 999;
        elm.style.transition = "none"; // stop weird jagged motion while dragging
        document
          .querySelectorAll(".app iframe")
          // stop from other apps capturing the mouse, interupting the move
          .forEach((app) => (app.style.pointerEvents = "none"));
      },
      move(event) {
        if (elm.classList.contains("max")) return;
        const target = event.target;
        const x = (parseFloat(target.getAttribute("data-x")) || 0) + event.dx;
        const y = (parseFloat(target.getAttribute("data-y")) || 0) + event.dy;

        target.style.transform = `translate(${x}px, ${y}px)`;
        target.setAttribute("data-x", x);
        target.setAttribute("data-y", y);
      },
      end() {
        elm.style.transition = "";
        document
          .querySelectorAll(".app iframe")
          .forEach((app) => (app.style.pointerEvents = ""));
      },
    },
  });

  if (shouldResize) {
    interaction.resizable({
      edges: { top: true, left: true, bottom: true, right: true }, // There should a an all flag for this 💔
      margin: 4,
      modifiers: [
        interact.modifiers.restrictSize({
          min: { width: minWidth, height: 30 },
        }),
        interact.modifiers.restrictRect({
          restriction: "parent",
        }),
      ],
      listeners: {
        start() {
          if (elm.classList.contains("max")) return;
          document
            .querySelectorAll(".app")
            .forEach((app) => (app.style.zIndex = 998));
          elm.style.zIndex = 999;
          elm.style.transition = "none";
          document
            .querySelectorAll(".app iframe")
            // stop from other apps capturing the mouse, interupting the drag
            .forEach((app) => (app.style.pointerEvents = "none"));
        },
        move(event) {
          if (elm.classList.contains("max")) return;
          const target = event.target;
          let x = parseFloat(target.getAttribute("data-x")) || 0;
          let y = parseFloat(target.getAttribute("data-y")) || 0;

          target.style.width = `${event.rect.width}px`;
          target.style.height = `${event.rect.height}px`;

          x += event.deltaRect.left;
          y += event.deltaRect.top;

          target.style.transform = `translate(${x}px, ${y}px)`;
          target.setAttribute("data-x", x);
          target.setAttribute("data-y", y);
        },
        end() {
          elm.style.transition = "";
          document
            .querySelectorAll(".app iframe")
            .forEach((app) => (app.style.pointerEvents = ""));
        },
      },
    });
  }
}

const system = new System();
async function boot() {
  await system.setup();
}

boot();
