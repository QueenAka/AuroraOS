class AppAPI {
  #eventCalls = {};
  #appId = null;
  #permissions = [];

  constructor() {
    Object.freeze(this);
  }

  get appId() {
    return this.#appId;
  }

  get permissions() {
    return structuredClone(this.#permissions);
  }

  onEvent(event, func) {
    this.#eventCalls[event] = func;
  }

  offEvent(event) {
    delete this.#eventCalls[event];
  }

  hasPermission(name) {
    return this.#permissions.includes?.(name);
  }

  sendMessage(type, data = {}) {
    window.parent.postMessage({ appId: this.#appId, type, data }, "*");
  }

  getEvent(eventId) {
    return this.#eventCalls[eventId];
  }

  setAppId(id) {
    if (!this.#appId) this.#appId = id;
  }

  setPermissions(perms) {
    this.#permissions = Object.freeze(structuredClone(perms));
  }

  static configureFromOS(instance, { appId, permissions }) {
    if (!(instance instanceof AppAPI)) throw new Error("Invalid instance.");
    instance.setAppId(appId);
    instance.setPermissions(permissions);
  }
}

const cln3 = new AppAPI();

window.addEventListener("message", (e) => {
  const { event, data } = e.data;
  if (event === "sendId") {
    AppAPI.configureFromOS(cln3, {
      appId: data.appId,
      permissions: data.permissions,
    });
  } else {
    if (!event || !cln3.getEvent(event)) return;

    setTimeout(() => {
      console.log(event, data);
      try {
        cln3.getEvent(event)(data);
      } catch (err) {
        console.error(`Error handling event "${event}": `, err);
      }
    }, 1000);
  }
});
