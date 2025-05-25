async function unpackageApp(data) {
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

fetch("../apps/.json")
  .then((res) => res.json())
  .then((apps) => {
    apps.forEach((app) => {
      const card = document.createElement("card");
      const icon = document.createElement("card");
      const name = document.createElement("card");
      const desc = document.createElement("card");
      card.classList.add("card");
      icon.classList.add("icon");
      name.classList.add("name");
      desc.classList.add("desc");
      fetch(`../apps/${app}.cln3`)
        .then((res) => res.arrayBuffer())
        .then(async (zip) => {
          const appFiles = await unpackageApp(zip);
          const meta = await appFiles.get("/meta.json").text();
          const metaData = JSON.parse(meta);
          let appIcon;
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
          } else appIcon = "app.svg";
          icon.style = `--url: url(${appIcon})`;
          name.textContent = metaData.name;
          desc.textContent = metaData.description || "No app description";
          card.appendChild(icon);
          card.appendChild(name);
          card.appendChild(desc);
          document.querySelector(".cards").appendChild(card);
        });
    });
  });
