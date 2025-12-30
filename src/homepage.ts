import { pageResponse } from "./pageResponse";
import { html } from "@thai/html";
import { lightSceneEntities } from "./hass";

export function homepage() {
  return pageResponse("Dashboard", html``, {
    header: html`
      <style>
        :root {
          --text-main: #fff;
          --links: #fff;
          --background-body: #000;
          --background: #000;
        }
      </style>
      <div
        style="position: absolute; top: 0; left: 0; right: 50%; bottom: 0; background: black; color: white; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column;"
      >
        <div style="flex: 1">${renderClock()}</div>
        <div>${renderHass()}</div>
      </div>
      <div
        style="position: absolute; top: 0; left: 50%; right: 0; bottom: 0; background: white; color: black; overflow-y: auto; overflow-x: hidden; padding: 0 16px; display: flex; flex-direction: column;"
      >
        ${renderProductivity()}
      </div>
    `,
  });
}

function renderClock() {
  return html`<div
      id="now"
      style="font-weight: bold; font-size: 16vw; line-height: 1.25em; text-align: center; letter-spacing: 0; font-family: var(--font-monospace); position: relative;"
    >
      <div
        data-now-text
        style="position: absolute; top: 0; left: 0; right: 0; transform: translate(0.1ex, 0.1ex); opacity: 0.5;
                mask-image: repeating-linear-gradient(-45deg, transparent, transparent 0.01em, black 0.01em, black 0.015em);"
      >
        …
      </div>
      <div
        data-now-text
        style="position: relative; text-shadow: 0.05ex 0.05ex 0 black;"
      >
        …
      </div>
    </div>
    <div style="display: flex; justify-content: center;">
      <div
        style="line-height: 1.2; padding: 0 16px; font-style: italic; font-size: 6vw; padding-bottom: 0.5em;"
      >
        <div id="dow"></div>
        <div id="day"></div>
      </div>
    </div>
    <script>
      const updateNow = () => {
        const h = new Date().getHours();
        const m = new Date().getMinutes();
        const html =
          h +
          "<span style='display: inline-block; margin: 0 -0.125ch; font-weight: normal;'>:</span>" +
          String(m).padStart(2, "0");
        for (const el of document.querySelectorAll("#now [data-now-text]")) {
          el.innerHTML = html;
        }
        const dow = new Intl.DateTimeFormat("en-US", {
          weekday: "long",
        }).format(new Date());
        const day = new Intl.DateTimeFormat("en-US", {
          day: "numeric",
          month: "long",
        }).format(new Date());
        document.getElementById("dow").innerText = dow;
        document.getElementById("day").innerText = day;
      };
      setInterval(updateNow, 5000);
      updateNow();
    </script>`;
}

function renderHass() {
  return html`<style>
      .hass {
        padding: 0 16px;
        font-size: 16px;
      }
      .hass table {
        width: 100%;
        table-layout: fixed;
      }
      .hass button {
        display: block;
        width: 100%;
        padding: 0.56em 0 0.72em;
        margin: 0;
        background: transparent !important;
        color: white;
        border: 0;
        box-shadow: inset 0 0 0 1px white;
      }
      .hass th {
        padding-bottom: 0;
      }
      .hass td[data-active="true"] button {
        box-shadow: inset 0 0 0 2px white;
        font-weight: bold;
      }
    </style>

    <div
      data-light-presets="${JSON.stringify(lightSceneEntities)}"
      x-data="{
        lightPresets: JSON.parse($el.dataset.lightPresets),
        ac: '',
        lights: '',
        async init() {
          this.timer = setInterval(() => this.load(), 15000)
          await this.load()
        },
        destroy() {
          clearInterval(this.timer)
        },
        async load() {
          const result = await fetch('/hass/status').then(r => r.json())
          this.ac = result.ac
          this.lights = result.lights
        },
        async setLights(entityId) {
          this.lights = entityId
          await fetch('/hass/lights', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ entityId }),
          })
        },
        async setAc(state) {
          this.ac = state
          await fetch('/hass/ac', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ state }),
          })
        },
      }"
      class="hass"
    >
      <table>
        <tr>
          <th :colspan="Object.keys(lightPresets).length">Lights</th>
        </tr>
        <tr>
          <template x-for="[entityId, name] of Object.entries(lightPresets)">
            <td :data-active="lights === entityId">
              <button @click="setLights(entityId)" x-text="name"></button>
            </td>
          </template>
        </tr>
        <tr>
          <th colspan="2">AC</th>
        </tr>
        <tr>
          <td :data-active="ac == 'off'">
            <button @click="setAc('off')">Off</button>
          </td>
          <td :data-active="ac == 'on'">
            <button @click="setAc('on')">On</button>
          </td>
        </tr>
      </table>
    </div>`;
}

function renderProductivity() {
  return html`<div x-data="productivity">
      <!-- Google Tasks tasks -->
      <ul style="list-style: none; padding: 0; margin: 0; font-size: 16px;">
        <template x-for="task in tasks" :key="task.id">
          <li
            style="padding: 8px 0; border-bottom: 1px solid #ccc; display: flex;"
          >
            <!-- Checkbox -->
            <div style="margin-right: 8px;">
              <template x-if="task.completed">
                <span>☑️</span>
              </template>
              <template x-if="!task.completed">
                <span>⬜</span>
              </template>
            </div>
            <!-- Task title -->
            <span
              x-text="task.title"
              style="flex: 1;"
              :style="task.completed ? 'opacity: 0.5' : ''"
            ></span>
          </li>
        </template>
      </ul>
    </div>
    <script>
      document.addEventListener("alpine:init", () => {
        Alpine.data("productivity", () => ({
          // Array of Google Tasks tasks
          tasks: [],
          timer: null,
          async init() {
            this.timer = setInterval(() => this.load(), 300000);
            await this.load();
          },
          async load() {
            const result = await fetch("/productivity").then((r) => r.json());
            this.tasks = result;
          },
        }));
      });
    </script>`;
}
