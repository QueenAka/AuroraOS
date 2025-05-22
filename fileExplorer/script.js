class FileSystem {
  constructor() {
    this.dbName = "AuroraOS";
    this.storeName = "root";
    this.dbPromise = this.init();
  }

  async init() {
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

  async unpackageApp(data) {
    if (!data) {
      alert("Please select a .cln3 file to run.");
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

  async list(prefix = "") {
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
}

const fs = new FileSystem();
let currDir = "/";
let selectedPath = null;
let history = [];
let historyIndex = 0;
const loc = document.getElementById("location");
loc.onkeydown = (e) => {
  if (e.key == "Enter") loadDir(loc.value);
};

class Popup {
  constructor(json) {
    this.json = json;
    this.elements = {};
    this.popup = null;
  }

  create() {
    const popupHolder = document.createElement("div");
    const popup = document.createElement("div");
    const title = document.createElement("div");
    const close = document.createElement("div");
    const inputs = document.createElement("div");
    const buttons = document.createElement("div");
    this.json.content.forEach((i) => {
      let input;
      if (i.type == "input") {
        input = document.createElement("input");
        input.placeholder = i.name;
      } else if (i.type == "dropdown") {
        input = document.createElement("select");
        i.options?.forEach((opt) => {
          const option = document.createElement("option");
          option.value = opt.value;
          option.textContent = opt.label;
          input.appendChild(option);
        });
      }
      input.id = i.id;
      input.style.width = i.size;
      this.elements[i.id] = input;
      inputs.appendChild(input);
    });

    this.json.buttons.forEach((b) => {
      let button = document.createElement("button");
      button.innerText = b.name;
      button.id = b.id;
      button.onclick = b.event;
      button.style.width = b.size;
      this.elements[b.id] = button;
      buttons.appendChild(button);
    });

    popupHolder.classList.add("popup-holder");
    popup.classList.add("popup");
    title.classList.add("title");
    close.classList.add("close");
    inputs.classList.add("inputs");
    buttons.classList.add("buttons");
    title.textContent = this.json.title;
    close.textContent = "×";
    close.onclick = () => this.delete();
    popupHolder.appendChild(popup);
    popup.appendChild(title);
    popup.appendChild(close);
    popup.appendChild(inputs);
    popup.appendChild(buttons);
    popupHolder.style.opacity = 0;
    this.popup = popupHolder;
    document.body.appendChild(popupHolder);
    setTimeout(() => {
      popupHolder.style.opacity = 1;
    }, 100);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.delete();
    });
  }

  delete() {
    this.popup.style.opacity = 0;
    setTimeout(() => {
      this.popup.remove();
    }, 120);
  }
}

function nav(type) {
  if (type === "reload") {
    loadDir(currDir, false);
  } else if (type === "home") {
    loadDir("/");
  } else if (type === "back") {
    if (historyIndex > 0) {
      historyIndex--;
      loadDir(history[historyIndex], false);
    }
  } else if (type === "forward") {
    if (historyIndex < history.length - 1) {
      historyIndex++;
      loadDir(history[historyIndex], false);
    }
  } else if (type === "newDir") {
    const popup = new Popup({
      title: "Name your new folder",
      content: [
        { type: "input", id: "dirName", size: "100%", name: "Folder Name" },
      ],
      buttons: [
        {
          id: "confirm",
          size: "calc(50% - 5px)",
          event: async function () {
            await fs.put(
              (currDir.endsWith("/") ? currDir : currDir + "/") +
                popup.elements["dirName"].value,
              {
                type: "dir",
                meta: {
                  ts: Date.now(),
                },
              }
            );
            nav("reload");
            popup.delete();
          },
          name: "Confirm",
        },
        {
          id: "cancel",
          size: "calc(50% - 5px)",
          event: function () {
            popup.delete();
          },
          name: "Cancel",
        },
      ],
    });
    popup.create();
  } else if (type === "newFile") {
    const popup = new Popup({
      title: "Create a new file",
      content: [
        {
          type: "input",
          id: "fileName",
          size: "calc(75% - 10px)",
          name: "File Name",
        },
        {
          type: "dropdown",
          id: "fileType",
          size: "calc(25% - 10px)",
          options: [
            { label: "Text", value: "txt" },
            { label: "Image", value: "img" },
            { label: "Video", value: "vid" },
            { label: "Audio", value: "aud" },
            { label: "App", value: "app" },
          ],
        },
      ],
      buttons: [
        {
          id: "confirm",
          size: "calc(50% - 5px)",
          event: async function () {
            await fs.put(
              (currDir.endsWith("/") ? currDir : currDir + "/") +
                popup.elements["fileName"].value,
              {
                type: popup.elements["fileType"].value,
                content: null,
                meta: {
                  ts: Date.now(),
                },
              }
            );
            nav("reload");
            popup.delete();
          },
          name: "Confirm",
        },
        {
          id: "cancel",
          size: "calc(50% - 5px)",
          event: function () {
            popup.delete();
          },
          name: "Cancel",
        },
      ],
    });
    popup.create();
  } else if (type === "uploadFile") {
    function inferFileType(mime, ext) {
      if (mime.startsWith("image/")) return "img";
      if (mime.startsWith("video/")) return "vid";
      if (mime.startsWith("audio/")) return "aud";
      if (mime === "application/zip") return "zip";
      if (ext === "lnk") return "lnk";
      if (ext === "cln3") return "app";
      if (mime.startsWith("text/")) return "txt";
      return "bin";
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "*/*";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = async (event) => {
        const data = event.target.result;
        const mime = file.type || "application/octet-stream";
        const extension = file.name.split(".").pop().toLowerCase();
        if (extension === "cln3") {
          try {
            const fileMap = await fs.unpackageApp(data);
            const meta = JSON.parse(await fileMap.get("/meta.json").text());
            await fs.put(
              `${currDir.endsWith("/") ? currDir : currDir + "/"}${file.name}`,
              {
                type: "app",
                cont: Array.from(new Uint8Array(data)),
                meta: {
                  ts: Date.now(),
                },
              }
            );
          } catch (err) {
            console.error("Failed to unpack .cln3 file:", err);
          }
        } else {
          await fs.put(
            `${currDir.endsWith("/") ? currDir : currDir + "/"}${file.name}`,
            {
              type: inferFileType(mime, extension),
              cont: Array.from(new Uint8Array(data)),
              meta: {
                ts: Date.now(),
                mime,
              },
            }
          );
        }
        nav("reload");
      };

      reader.readAsArrayBuffer(file);
    };

    input.click();
  }
}

async function loadDir(dir, pushHistory = true) {
  const root = await fs.list(dir);
  if (!root) {
    loc.value = currDir;
    return;
  }

  currDir = dir;
  if (pushHistory) {
    if (history[historyIndex] !== dir) {
      history = history.slice(0, historyIndex + 1);
      history.push(dir);
      historyIndex = history.length - 1;
    }
  }

  document
    .getElementById("back")
    .classList.toggle("disabled", historyIndex <= 0);
  document
    .getElementById("forward")
    .classList.toggle("disabled", historyIndex >= history.length - 1);

  const items = document.getElementById("items");
  items.innerHTML = "";
  loc.value = dir;

  if (dir !== "/" && dir !== "") {
    const elm = document.createElement("div");
    elm.style = `--url: url(./media/back.svg)`;
    elm.innerText = "Parent directory";
    items.appendChild(elm);
    elm.ondblclick = () => {
      const parent =
        dir.replace(/\/$/, "").split("/").slice(0, -1).join("/") || "/";
      loadDir(parent, true);
    };
  }

  const categorized = {
    dir: [],
    app: [],
    other: [],
  };

  for (const file of root) {
    const content = await fs.get(file);
    const name = file.replace(dir, "").replace("/", "");
    const entry = { file, content, name };

    if (content.type === "dir") {
      categorized.dir.push(entry);
    } else if (content.type === "app") {
      categorized.app.push(entry);
    } else {
      categorized.other.push(entry);
    }
  }

  const renderEntry = async ({ file, content, name }) => {
    const elm = document.createElement("div");
    elm.style = `--url: url(./media/${content.type}.svg)`;
    elm.innerText = name;

    if (content.type === "dir") {
      elm.ondblclick = () => {
        const newPath = dir.endsWith("/") ? dir + name : dir + "/" + name;
        loadDir(newPath, true);
      };
    }

    if (content.type === "app" && typeof content.cont !== "string") {
      const appFiles = await fs.unpackageApp(content.cont);
      const meta = JSON.parse(await appFiles.get("/meta.json").text());
      if (meta.icon) {
        const iconFile = appFiles.get("/" + meta.icon);
        if (iconFile) {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result;
            elm.style = "--url: url(" + base64 + ")";
          };
          reader.readAsDataURL(iconFile);
        }
      }
    }

    if (content.type !== "dir") {
      elm.ondblclick = () => {
        const newPath = dir.endsWith("/") ? dir + name : dir + "/" + name;
        cln3.sendMessage("open", { path: newPath });
      };
    }

    items.appendChild(elm);
  };

  for (const entry of [
    ...categorized.dir,
    ...categorized.app,
    ...categorized.other,
  ]) {
    await renderEntry(entry);
  }
}

loadDir("/");
setTimeout(() => {
  cln3.onEvent("saveFile", () => {
    const right = document.getElementById("right");
    right.innerHTML = "";
    const save = document.createElement("img");
    save.classList.add("button");
    save.src = "./media/save.svg";
    right.appendChild(save);
  });
}, 1000);
