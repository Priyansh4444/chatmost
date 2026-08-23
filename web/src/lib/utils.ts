import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export const KNOWN_BOTS = new Set([
  "streamelements",
  "stream-elements",
  "stream_elements",
  "nightbot",
  "fossabot",
  "wizebot",
  "moobot",
  "streamlabs",
  "stream-labs",
  "stream_labs",
  "botisimo",
  "soundalerts",
  "creekbot",
  "kofi_bot",
  "kofibot",
  "buttsbot",
  "pretzelrocks",
  "restreambot",
  "songlistbot",
  "sery_bot",
  "serybot",
  "twirapp",
  "commanderroot",
  "ankhbot",
  "trollbot",
  "electroblobbot",
  "pronterplay",
  "phantombot",
  "botrix",
  "streamerbot",
  "stay_hydrated_bot",
  "cozybot",
]);

export function isBot(login: string | undefined | null): boolean {
  if (!login) return true;
  const clean = login.toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (KNOWN_BOTS.has(clean) || KNOWN_BOTS.has(login.toLowerCase())) return true;
  if (
    clean.includes("streamelements") ||
    clean.includes("streamlabs") ||
    clean.includes("nightbot") ||
    clean.includes("fossabot")
  ) {
    return true;
  }
  if (clean.endsWith("bot") && (clean.startsWith("stream") || clean.startsWith("twitch"))) {
    return true;
  }
  return false;
}

export const STOP_WORDS = new Set(
  `a about above across after again against all almost alone along already also although always am among an and another any anybody anyone anything anyway anywhere are arent around as at back be became because become becomes becoming been before beforehand behind being below beside besides between beyond both but by call came can cannot cant come could couldnt dare did didnt do does doesnt doing done dont down due during each either else elsewhere empty enough even ever every everybody everyone everything everywhere except few fifteen fify fill find first for former formerly forth four from front full further get give go had hadnt has hasnt have havent having he hed hell hes help hence her here hereafter hereby herein hereupon hers herself him himself his how however hundred i id ill im ive if in indeed into is isnt it its itself keep keepnt last latter latterly least less like made make many may maybe me meanwhile might mill mine more moreover most mostly much must mustnt my myself name namely neither never nevertheless next nine no nobody none noone nor not nothing now nowhere of off often on once one only onto or other others otherwise our ours ourselves out over own part per perhaps please put rather re really right said same say saw see seen seein several shall shant she shed shell shes should shouldnt show side since six sixty so some somebody somehow someone something sometime sometimes somewhere still stuff such sure take tell than that the their theirs them themselves then thence there thereafter thereby therefore therein thereupon these they theyd theyll theyre theyve thing think this those though through throughout thru thus to together too top toward towards twelve twenty two under unless until up upon us use used using various very via want was wasnt way we wed well were werent wet weve what whatever when whence whenever where whereafter whereas whereby wherein whereupon wherever whether which while whither who whoever whole whom whose why will with within without wont would wouldnt yeah yea yes yet you youd youll your youre yours yourself yourselves ok okay oh uh hmm hey hi hello lol lmao rofl gg wp going gone went look looks need`
    .split(/\s+/)
    .map((w) => w.toLowerCase())
);