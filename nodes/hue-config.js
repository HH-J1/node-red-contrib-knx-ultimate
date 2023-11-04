/* eslint-disable no-lonely-if */
/* eslint-disable no-param-reassign */
/* eslint-disable no-inner-declarations */
/* eslint-disable max-len */
const dptlib = require("../KNXEngine/src/dptlib");
const HueClass = require("./utils/hueEngine").classHUE;
const loggerEngine = require("./utils/sysLogger");
const hueColorConverter = require("./utils/hueColorConverter");

function getRandomIntInclusive(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1) + min); // The maximum is inclusive and the minimum is inclusive
}

// Helpers
const sortBy = (field) => (a, b) => {
  if (a[field] > b[field]) {
    return 1;
  }
  return -1;
};

const onlyDptKeys = (kv) => kv[0].startsWith("DPT");

const extractBaseNo = (kv) => ({
  subtypes: kv[1].subtypes,
  base: parseInt(kv[1].id.replace("DPT", "")),
});

const convertSubtype = (baseType) => (kv) => {
  const value = `${baseType.base}.${kv[0]}`;
  // let sRet = value + " " + kv[1].name + (kv[1].unit === undefined ? "" : " (" + kv[1].unit + ")");
  const sRet = `${value} ${kv[1].name}`;
  return {
    value,
    text: sRet,
  };
};

const toConcattedSubtypes = (acc, baseType) => {
  const subtypes = Object.entries(baseType.subtypes).sort(sortBy(0)).map(convertSubtype(baseType));
  return acc.concat(subtypes);
};

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min) + min); // The maximum is exclusive and the minimum is inclusive
}

module.exports = (RED) => {
  function hueConfig(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    node.host = config.host;
    node.nodeClients = []; // Stores the registered clients
    node.loglevel = config.loglevel !== undefined ? config.loglevel : "error"; // 18/02/2020 Loglevel default error
    node.sysLogger = null;
    node.hueAllResources = undefined;
    node.timerHUEConfigCheckState = null; // Timer that check the connection to the hue bridge every xx seconds
    node.linkStatus = "disconnected";
    try {
      node.sysLogger = loggerEngine.get({ loglevel: node.loglevel }); // New logger to adhere to the loglevel selected in the config-window
    } catch (error) {
      /* empty */
    }
    node.name = config.name === undefined || config.name === "" ? node.host : config.name;

    // Call the connect function of all hue-config nodes.
    // function callinitHUEConnectionOfAllHUEServers() {
    //   RED.nodes.eachNode((_node) => {
    //     if (_node.type === 'hue-config') {
    //       try {
    //         RED.nodes.getNode(_node.id).initHUEConnection();
    //       } catch (error) {
    //         if (node.sysLogger !== undefined && node.sysLogger !== null) node.sysLogger.error("callinitHUEConnectionOfAllHUEServers: Node " + _node.name + " " + error.message);
    //       }
    //     }
    //   });
    // }

    // Connect to Bridge and get the resources
    node.initHUEConnection = async () => {
      try {
        if (node.hueManager !== undefined) node.hueManager.close();
      } catch (error) { }
      try {
        if (node.hueManager !== undefined) node.hueManager.removeAllListeners();
      } catch (error) { }
      // Handle events
      try {
        try {
          // Init HUE Utility
          node.hueManager = new HueClass(node.host, node.credentials.username, node.credentials.clientkey, config.bridgeid, node.sysLogger);
        } catch (error) { }
        await node.hueManager.Connect();
      } catch (error) {
        /* empty */
      }
      node.hueManager.on("event", (_event) => {
        node.nodeClients.forEach((_oClient) => {
          const oClient = _oClient;
          try {
            if (oClient.handleSendHUE !== undefined) oClient.handleSendHUE(_event);
          } catch (error) {
            if (node.sysLogger !== undefined && node.sysLogger !== null) node.sysLogger.error(`Errore node.hueManager.on(event): ${error.message}`);
          }
        });
      });
      // Connected
      node.hueManager.on("connected", () => {
        node.linkStatus = "connected";
        // Start the timer to do initial read.
        if (node.timerDoInitialRead !== null) clearTimeout(node.timerDoInitialRead);
        node.timerDoInitialRead = setTimeout(() => {
          node.loadResourcesFromHUEBridge();
        }, 6000); // 17/02/2020 Do initial read of all nodes requesting initial read
      });
    };

    node.startWatchdogTimer = () => {
      node.timerHUEConfigCheckState = setTimeout(() => {
        (async () => {
          if (node.linkStatus === "disconnected") {
            await node.initHUEConnection();
          } else {
            // Check wether the hue connection is still alive
            const ret = await node.hueManager.isConnected();
            if (!ret) node.linkStatus = "disconnected";
          }
          node.startWatchdogTimer();
        })();
      }, 10000);
    };
    node.startWatchdogTimer();

    // Query the HUE Bridge to return the resources
    node.loadResourcesFromHUEBridge = () => {
      (async () => {
        // °°°°°° Load ALL resources
        try {
          node.hueAllResources = await node.hueManager.hueApiV2.get("/resource");
          if (node.hueAllResources !== undefined) {
            node.hueAllRooms = node.hueAllResources.filter((a) => a.type === "room");
            // Update all KNX State of the nodes with the new hue device values
            node.nodeClients.forEach((_node) => {
              if (_node.hueDevice !== undefined && node.hueAllResources !== undefined) {
                const oHUEDevice = node.hueAllResources.filter((a) => a.id === _node.hueDevice)[0];
                if (oHUEDevice !== undefined) {
                  // Add _Node to the clients array
                  _node.setNodeStatusHue({
                    fill: "green",
                    shape: "ring",
                    text: "Ready :-)",
                  });
                  _node.currentHUEDevice = oHUEDevice;
                  if (_node.initializingAtStart === true) _node.handleSendHUE(oHUEDevice);
                }
              }
            });
          } else {
            // The config node cannot read the resources. Signalling disconnected
          }
        } catch (error) {
          if (this.sysLogger !== undefined && this.sysLogger !== null) {
            this.sysLogger.error(`KNXUltimatehueEngine: loadResourcesFromHUEBridge: ${error.message}`);
            return (error.message);
          }
        }
        return true;
      })();
    };

    // Returns the cached devices (node.hueAllResources) by type.
    node.getResources = function getResources(_rtype) {
      try {
        if (node.hueAllResources === undefined) return;
        // Returns capitalized string
        function capStr(s) {
          if (typeof s !== "string") return "";
          return s.charAt(0).toUpperCase() + s.slice(1);
        }
        const retArray = [];
        let allResources;
        if (_rtype === "light" || _rtype === "grouped_light") {
          allResources = node.hueAllResources.filter((a) => a.type === "light" || a.type === "grouped_light");
        } else {
          allResources = node.hueAllResources.filter((a) => a.type === _rtype);
        }
        for (let index = 0; index < allResources.length; index++) {
          const resource = allResources[index];
          // Get the owner
          try {
            let resourceName = "";
            let sType = "";
            if (_rtype === "light" || _rtype === "grouped_light") {
              // It's a service, having a owner
              const owners = node.hueAllResources.filter((a) => a.id === resource.owner.rid);
              for (let index = 0; index < owners.length; index++) {
                const owner = owners[index];
                if (owner.type === "bridge_home") {
                  resourceName += "ALL GROUPS and ";
                } else {
                  resourceName += `${owner.metadata.name} and `;
                  // const room = node.hueAllRooms.find((child) => child.children.find((a) => a.rid === owner.id));
                  // sRoom += room !== undefined ? `${room.metadata.name} + ` : " + ";
                  sType += `${capStr(owner.type)} + `;
                }
              }
              sType = sType.slice(0, -" + ".length);
              resourceName = resourceName.slice(0, -" and ".length);
              resourceName += sType !== "" ? ` (${sType})` : "";
              retArray.push({
                name: `${capStr(resource.type)}: ${resourceName}`,
                id: resource.id,
                deviceObject: resource,
              });
            }
            if (_rtype === "scene") {
              resourceName = resource.metadata.name || "**Name Not Found**";
              // Get the linked zone
              const zone = node.hueAllResources.find((res) => res.id === resource.group.rid);
              resourceName += ` - ${capStr(resource.group.rtype)}: ${zone.metadata.name}`;
              retArray.push({
                name: `${capStr(_rtype)}: ${resourceName}`,
                id: resource.id,
              });
            }
            if (_rtype === "button") {
              const linkedDevName = node.hueAllResources.find((dev) => dev.type === "device" && dev.services.find((serv) => serv.rid === resource.id)).metadata.name || "";
              const controlID = resource.metadata !== undefined ? resource.metadata.control_id || "" : "";
              retArray.push({
                name: `${capStr(_rtype)}: ${linkedDevName}, button ${controlID}`,
                id: resource.id,
              });
            }
            if (_rtype === "motion" || _rtype === "camera_motion") {
              const linkedDevName = node.hueAllResources.find((dev) => dev.type === "device" && dev.services.find((serv) => serv.rid === resource.id)).metadata.name || "";
              retArray.push({
                name: `${capStr(_rtype)}: ${linkedDevName}`,
                id: resource.id,
              });
            }
            if (_rtype === "relative_rotary") {
              const linkedDevName = node.hueAllResources.find((dev) => dev.type === "device" && dev.services.find((serv) => serv.rid === resource.id)).metadata.name || "";
              retArray.push({
                name: `Rotary: ${linkedDevName}`,
                id: resource.id,
              });
            }
            if (_rtype === "light_level") {
              const Room = node.hueAllRooms.find((room) => room.children.find((child) => child.rid === resource.owner.rid));
              const linkedDevName = node.hueAllResources.find((dev) => dev.type === "device" && dev.services.find((serv) => serv.rid === resource.id)).metadata.name || "";
              retArray.push({
                name: `Light Level: ${linkedDevName}${Room !== undefined ? `, room ${Room.metadata.name}` : ""}`,
                id: resource.id,
              });
            }
            if (_rtype === "temperature") {
              const Room = node.hueAllRooms.find((room) => room.children.find((child) => child.rid === resource.owner.rid));
              const linkedDevName = node.hueAllResources.find((dev) => dev.type === "device" && dev.services.find((serv) => serv.rid === resource.id)).metadata.name || "";
              retArray.push({
                name: `Temperature: ${linkedDevName}${Room !== undefined ? `, room ${Room.metadata.name}` : ""}`,
                id: resource.id,
              });
            }
            if (_rtype === "device_power") {
              const Room = node.hueAllRooms.find((room) => room.children.find((child) => child.rid === resource.owner.rid));
              const linkedDevName = node.hueAllResources.find((dev) => dev.type === "device" && dev.services.find((serv) => serv.rid === resource.id)).metadata.name || "";
              retArray.push({
                name: `Battery: ${linkedDevName}${Room !== undefined ? `, room ${Room.metadata.name}` : ""}`,
                id: resource.id,
              });
            }
          } catch (error) {
            retArray.push({
              name: `${_rtype}: ERROR ${error.message}`,
              id: resource.id,
            });
          }
        }
        return { devices: retArray };
      } catch (error) {
        if (node.sysLogger !== undefined && node.sysLogger !== null) node.sysLogger.error(`KNXUltimateHue: hueEngine: classHUE: getResources: error ${error.message}`);
        return { devices: error.message };
      }
    };

    // Query HUE Bridge and get the updated color.
    node.getColorFromHueLight = (_lightId) => {
      try {
        // await node.loadResourcesFromHUEBridge();
        const oLight = node.hueAllResources.filter((a) => a.id === _lightId)[0];
        const ret = hueColorConverter.ColorConverter.xyBriToRgb(oLight.color.xy.x, oLight.color.xy.y, oLight.dimming.brightness);
        return JSON.stringify(ret);
      } catch (error) {
        if (node.sysLogger !== undefined && node.sysLogger !== null) node.sysLogger.error(`KNXUltimateHue: hueEngine: getColorFromHueLight: error ${error.message}`);
        return {};
      }
    };

    node.addClient = (_Node) => {
      // Update the node hue device, as soon as a node register itself to hue-config nodeClients
      if (node.nodeClients.filter((x) => x.id === _Node.id).length === 0) {
        node.nodeClients.push(_Node);
        if (node.hueAllResources !== undefined && node.hueAllResources !== null && _Node.initializingAtStart === true) {
          const oHUEDevice = node.hueAllResources.filter((a) => a.id === _Node.hueDevice)[0];
          if (oHUEDevice !== undefined) {
            _Node.currentHUEDevice = oHUEDevice;
            _Node.handleSendHUE(oHUEDevice);
            // Add _Node to the clients array
            _Node.setNodeStatusHue({
              fill: "yellow",
              shape: "dot",
              text: "Initializing. Please Wait.",
            });
          }
        } else {
          node.linkStatus = "disconnected";
          // Add _Node to the clients array
          _Node.setNodeStatusHue({
            fill: "grey",
            shape: "ring",
            text: "Waiting for connection",
          });
        }
      }
    };

    node.removeClient = (_Node) => {
      // Remove the client node from the clients array
      try {
        node.nodeClients = node.nodeClients.filter((x) => x.id !== _Node.id);
      } catch (error) {
        /* empty */
      }
    };

    node.on("close", (done) => {
      try {
        if (node.sysLogger !== undefined && node.sysLogger !== null) node.sysLogger = null;
        loggerEngine.destroy();
        node.nodeClients = [];
        node.hueManager.removeAllListeners();
        (async () => {
          try {
            await node.hueManager.close();
            node.hueManager = null;
            delete node.hueManager;
          } catch (error) {
            /* empty */
          }
          done();
        })();
      } catch (error) {
        done();
      }
    });

    RED.httpAdmin.get("/knxUltimateGetHueColor", RED.auth.needsPermission("hue-config.read"), (req, res) => {
      try {
        const rgbColor = node.getColorFromHueLight(req.query.id);
        res.json(rgbColor);
      } catch (error) {
        res.json("Select the device first!");
      }
    });

    RED.httpAdmin.get("/KNXUltimateGetResourcesHUE", RED.auth.needsPermission("hue-config.read"), (req, res) => {
      try {
        // °°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°
        const serverNode = RED.nodes.getNode(req.query.nodeID); // Retrieve node.id of the config node.
        const jRet = serverNode.getResources(req.query.rtype);
        if (jRet !== undefined) {
          res.json(jRet);
        } else {
          res.json({ devices: [{ name: "I'm still connecting...Try in some seconds" }] });
        }
        // °°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°°
      } catch (error) {
        RED.log.error(`Errore KNXUltimateGetResourcesHUE non gestito ${error.message}`);
        res.json({ devices: error.message });
        // (async () => {
        //   await node.initHUEConnection();
        // })();
      }
    });

    RED.httpAdmin.get("/knxUltimateDpts", RED.auth.needsPermission("hue-config.read"), (req, res) => {
      const dpts = Object.entries(dptlib).filter(onlyDptKeys).map(extractBaseNo).sort(sortBy("base")).reduce(toConcattedSubtypes, []);
      res.json(dpts);
    });
  }
  RED.nodes.registerType("hue-config", hueConfig, {
    credentials: {
      username: { type: "password" },
      clientkey: { type: "password" },
    },
  });
};
