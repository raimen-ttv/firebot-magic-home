import {
  Firebot,
  RunRequest,
  ScriptReturnObject
} from "@crowbartools/firebot-custom-scripts-types";
import { EffectTriggerResponse, Effects } from "@crowbartools/firebot-custom-scripts-types/types/effects";
import { Control } from 'magic-home';
import { Discovery } from 'magic-home';
import { Logger } from "@crowbartools/firebot-custom-scripts-types/types/modules/logger";
import { LocalStorage } from "node-localstorage";
// global.localStorage = new LocalStorage("./magicHome")

// interface Params {
//   id: [string],
//   enable: [string],
//   percentage: string
// }

type InputParams = {
  id: string | [string],
  enable: string | [string],
  percentage: string,
}

let logger: Logger;

const script: Firebot.CustomScript<InputParams> = {
  getScriptManifest: () => {
    return {
      name: "Hype guy controller",
      description: "for magic home",
      author: "Raimen",
      version: "1.5",
      firebotVersion: "5",
    };
  },
  getDefaultParameters: () => {
    // let encodedDevices = localStorage.getItem("test");
    // let storedDevices: {[key:string]:string} = {replace:"me"};
    // if (!encodedDevices) {
    //   discoverLights().then(devices => {
    //     storedDevices = devices;
    //     localStorage.setItem("test", JSON.stringify(devices));
    //   })
    // } else {
    //   storedDevices = JSON.parse(encodedDevices);
    // }

    
    let discovery = new Discovery();
    let deviceIDs:[string?] = [];
    discovery.scan(1000).then(devices => {
      devices.forEach(device => {
        deviceIDs.push(device.id)
      });
    });

    return {
      id: {
        type: "enum",
        showBottomHr : true,
        options: ["asdf"],
        default: ['asdf'].length == 0 ? "No devices found - please try to reload the script." : "",
        description: "Device ID",
      },
      enable: {
        type: "enum",
        options: ["Enable", "Disable"],
        default: "Enable",
        description: "Enable Light?",
      },
      percentage: {
        type: "string",
        default: "50",
        description: "Brightness percentage (0-100)"
      }
    };
  },
  run: async (runRequest: RunRequest<InputParams>): Promise<ScriptReturnObject> => {
    logger = runRequest.modules.logger;
    // logger.info("thing from storage is " + localStorage.getItem("test"))
    let thing: ScriptReturnObject = {
      // success: true,
      success: false,
      errorMessage: "Failed to run the script!", // If 'success' is false, this message is shown in a Firebot popup.
      effects: []
    }
    let foundDevices:{[key:string]: string} = runRequest.modules.customVariableManager.getCustomVariable("magicHomeDevices");

    try {
      // discover devices if not already declared
      if (Object.keys(foundDevices).length == 0) {
        foundDevices = await discoverLights();
        runRequest.modules.customVariableManager.addCustomVariable("magicHomeDevices", foundDevices, 36000)
      }

      let P = runRequest.parameters;
      thing.success = await toggleLight(foundDevices[String(P.id)], Number(P.percentage), P.enable == "Enable");
    } catch (e) {
      thing.success = false;
      thing.errorMessage=e;
    }

    return thing
  },
};

async function discoverLights(): Promise<{[key: string]: string}> {
  let discovery = new Discovery();
  let devices:Discovery.DiscoveryResult[] = [];
  let attempts = 0;

  while(attempts < 10 && devices.length == 0) {
    devices = await discovery.scan(500)
    attempts++;
  }
  let keyedDevices = keyDevicesByID(devices);

  // if (devices.length == 0){
  //   logger ? logger.error("no devices found on network") : null;
  // } else {
  //   logger ? logger.info("found devices "  + Object.keys(keyedDevices)) : null;
  // }

  return keyedDevices
}

async function toggleLight(ip:string, brightness: number, enable:boolean): Promise<boolean> {
  let overAllSuccess = false

  let light = new Control(ip);
  // light.setColorWithBrightness(0,0,0,brightness);
  await light.setPower(enable).then(success => {
    // do something with the result
    logger.info("turned " + (enable ? "on": "off") + " lights for " + ip);
    overAllSuccess = success
  });
  return overAllSuccess;
}

function keyDevicesByID(arr:Discovery.DiscoveryResult[]): { [key:string]: string } {
  let keyedDevices: {[key:string]: string } = {}
  arr.forEach(device => {
    keyedDevices[device.id] = device.address
  });
  return keyedDevices
}

export default script;
