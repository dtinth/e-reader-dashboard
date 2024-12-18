import { generateSpeech } from "../tts";

await Bun.write(
  "tmp.local/output.mp3",
  new Blob([
    await generateSpeech(
      `A quick brown fox jumps over the lazy dog.

เป็นมนุษย์สุดประเสริฐเลิศคุณค่า		กว่าบรรดาฝูงสัตว์เดรัจฉาน
จงฝ่าฟันพัฒนาวิชาการ		อย่าล้างผลาญฤๅเข่นฆ่าบีฑาใคร
ไม่ถือโทษโกรธแช่งซัดฮึดฮัดด่า		หัดอภัยเหมือนกีฬาอัชฌาสัย
ปฏิบัติประพฤติกฎกำหนดใจ		พูดจาให้จ๊ะ ๆ จ๋า น่าฟังเอย`,
      "en-US-CoraMultilingualNeural"
    ),
  ])
);

console.log("yay");
