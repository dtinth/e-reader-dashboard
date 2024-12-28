import { ofetch } from "ofetch";

export const hass = ofetch.create({
  baseURL: Bun.env["HASS_URL"]!,
  headers: {
    Authorization: `Bearer ${Bun.env["HASS_ACCESS_TOKEN"]}`,
  },
});

export async function activateScene(entityId: string) {
  await hass(`/api/services/scene/turn_on`, {
    method: "POST",
    body: { entity_id: entityId },
  });
}

export async function turnOffSwitch(entityId: string) {
  await hass(`/api/services/switch/turn_off`, {
    method: "POST",
    body: { entity_id: entityId },
  });
}

export async function turnOnSwitch(entityId: string) {
  await hass(`/api/services/switch/turn_on`, {
    method: "POST",
    body: { entity_id: entityId },
  });
}

export async function getEntityStates() {
  return await hass<
    {
      entity_id: string;
      state: string;
      attributes: Record<string, any>;
    }[]
  >(`/api/states`);
}

export const lightSceneEntities = {
  "scene.lights_off": "Off",
  "scene.lights_dimmed": "Dimmed",
  "scene.lights_normal": "Normal",
  "scene.lights_white": "White",
};

export const acEntity = "switch.ac";
