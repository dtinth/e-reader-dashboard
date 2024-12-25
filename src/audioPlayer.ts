import { html } from "@thai/html";
import type { GenerateSpeechBlobResult } from "./tts";

export function audioPlayer(props: { result: GenerateSpeechBlobResult }) {
  const sentencesPromise = props.result.sentences
    .download()
    .then((b) => b.toString());
  return html`<div>
    <div>Audio has been generated</div>
    <div
      data-sentences="${sentencesPromise}"
      x-data="{
        show: false,
        sentences: [],
        init() {
          this.sentences = (JSON.parse(this.$el.dataset.sentences));
          console.log(this.sentences)
        },
        toggle() {
          this.show = !this.show;
        },
        onTimeUpdate() {
          const audio = this.$refs.audio;
          if (!audio) return;
          this.updateCurrentSentence(audio.currentTime * 1000);
        },
        seek(seconds) {
          const audio = this.$refs.audio;
          if (!audio) return;
          audio.currentTime = Math.max(0, audio.currentTime + seconds);
        },
        updateCurrentSentence(timeMs) {
          if (!this.sentenceElements) {
            const items = this.$refs.scroller.querySelectorAll('li');
            if (items.length === 0) return;
            this.sentenceElements = Array.from(items, (element) => ({
              element,
              audioOffset: +element.dataset.audioOffset,
              duration: +element.dataset.duration,
            }));
          }
          const currentSentenceElement = this.sentenceElements.find(
            (item) => timeMs >= item.audioOffset && timeMs < item.audioOffset + item.duration
          )?.element;
          if (currentSentenceElement !== this.currentSentenceElement) {
            if (this.currentSentenceElement) {
              this.currentSentenceElement.style.backgroundColor = '';
            }
            if (currentSentenceElement) {
              currentSentenceElement.style.backgroundColor = 'yellow';
            }
            this.currentSentenceElement = currentSentenceElement;
          }
        },
        scrollToCurrent() {
          const audio = this.$refs.audio;
          if (!audio) return;
          const timeMs = audio.currentTime * 1000;
          console.log(this.$refs)
          const currentItem = Array.from(this.$refs.scroller.querySelectorAll('li')).find(item => {
            const offset = +item.dataset.audioOffset;
            const duration = +item.dataset.duration;
            return timeMs >= offset && timeMs < offset + duration;
          });
          console.log(timeMs, currentItem);
          if (currentItem) {
            currentItem.scrollIntoView({ behavior: 'instant', block: 'center' });
          }
        }
      }"
    >
      <div
        style="
          position: fixed;
          top: 0;
          right: 10px;
          left: 10px;
          padding: 10px;
          border: 2px solid black;
          border-top: none;
          background: white;
          z-index: 200;
        "
        x-bind:style="{
          transform: show ? 'translateY(0)' : 'translateY(-100%)',
        }"
      >
        <audio
          controls
          autoplay
          src="${props.result.audio.getUrl()}"
          style="box-sizing: border-box; width: 100%;"
          x-ref="audio"
          x-on:timeupdate="onTimeUpdate()"
        ></audio>
        <div style="max-height: 200px; overflow-y: auto;" x-ref="scroller">
          <ul>
            <template x-for="sentence of sentences">
              <li
                x-bind:data-audio-offset="sentence.AudioOffset"
                x-bind:data-duration="sentence.Duration"
              >
                <span x-text="sentence.Text"></span>
              </li>
            </template>
          </ul>
        </div>
        <div
          style="display: flex; justify-content: center; gap: 5px; flex-wrap: wrap; margin-top: 10px;"
        >
          <button x-on:click="seek(-60)">-60s</button>
          <button x-on:click="seek(-10)">-10s</button>
          <button x-on:click="scrollToCurrent()">Scroll</button>
          <button x-on:click="seek(10)">+10s</button>
          <button x-on:click="seek(60)">+60s</button>
        </div>
        <button
          style="
            position: absolute;
            top: calc(100%);
            right: 10px;
            background: white;
            padding: 5px 10px;
            border: 2px solid black;
            border-radius: 0 0 5px 5px;
            border-top: none;
          "
          x-on:click="toggle()"
        >
          Audio controls
        </button>
      </div>
    </div>
  </div>`;
}
