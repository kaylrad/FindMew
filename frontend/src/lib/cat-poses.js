export const GREETING_INTERVAL_MS = 30000;
export const POSE_DURATION_MS = { comfort: 3500, happy: 4500, greet: 3000 };
export const poseLabels = {
  idle: 'santai',
  sleep: 'tidur',
  happy: 'senang setelah makan',
  comfort: 'nyaman dielus',
  greet: 'menyapa',
  yawn: 'mengantuk',
};
export function resolvePetPose(energy, transient, now = Date.now()) {
  if (transient && transient.expiresAt > now && POSE_DURATION_MS[transient.pose])
    return transient.pose;
  return energy < 30 ? 'sleep' : 'idle';
}
export function canGreet(energy, transient, now = Date.now(), visible = true) {
  return visible && energy >= 30 && !(transient && transient.expiresAt > now);
}
export const mewPoseFrames = {
  yawn: {
    x: 50.52574157714844,
    y: 57.5848388671875,
    width: 224.19485473632812,
    height: 178.56219482421875,
    headWidth: 150.4409637451172,
    eyesX: 141.18209075927734,
    eyesY: 78.20945036315919,
    angle: 0,
  },
  idle: {
    x: 334.8301086425781,
    y: 25.99979591369629,
    width: 196.65255737304688,
    height: 210.2150115966797,
    headWidth: 143.30731201171875,
    eyesX: 79.40448904037476,
    eyesY: 71.24763059616089,
    angle: 0.0039430356334462825,
  },
  sleep: {
    x: 571.36572265625,
    y: 75.41114044189453,
    width: 226.1541748046875,
    height: 160.71815490722656,
    headWidth: 143.3975067138672,
    eyesX: 79.40340423583984,
    eyesY: 71.12176878356934,
    angle: 0,
  },
  happy: {
    x: 52.69097137451172,
    y: 282.6652526855469,
    width: 233.05450439453125,
    height: 220.2474822998047,
    headWidth: 151.018310546875,
    eyesX: 147.53626441955566,
    eyesY: 83.35721158981323,
    angle: 13.133118472258328,
  },
  comfort: {
    x: 310.1529541015625,
    y: 289.5914611816406,
    width: 202.61106872558594,
    height: 217.46719360351562,
    headWidth: 143.40728759765625,
    eyesX: 123.20653009414673,
    eyesY: 71.30613565444946,
    angle: 0.1359631448007971,
  },
  greet: {
    x: 556.6013793945312,
    y: 268.0712585449219,
    width: 216.3435516357422,
    height: 234.80538940429688,
    headWidth: 151.00462341308594,
    eyesX: 106.06238603591919,
    eyesY: 83.34909725189209,
    angle: 12.96133296288091,
  },
};
export const mewPoseSheets = {
  oyen: '/mymew/revision-oyenSheet.svg',
  mujair: '/mymew/revision-mujairSheet.svg',
  hitam: '/mymew/revision-hitamSheet.svg',
  putih: '/mymew/revision-putihSheet.svg',
};
