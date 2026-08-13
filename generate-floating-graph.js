// Generates an animated SVG contribution graph where active days gently
// float up and down. Pulls real data from the GitHub GraphQL API.
//
// Usage:
//   GH_USERNAME=yourname GH_TOKEN=xxxx node generate-floating-graph.js
//
// Outputs:
//   dist/floating-graph.svg        (light palette)
//   dist/floating-graph-dark.svg   (dark palette)

const fs = require("fs");
const path = require("path");

const USERNAME = process.env.GH_USERNAME;
const TOKEN = process.env.GH_TOKEN;

if (!USERNAME || !TOKEN) {
  console.error("Missing GH_USERNAME or GH_TOKEN environment variables.");
  process.exit(1);
}

const PALETTES = {
  light: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
  dark: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
};

const CELL = 11; // px
const GAP = 3; // px
const MARGIN = 20;

async function fetchContributions() {
  const query = `
    query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            weeks {
              contributionDays {
                date
                weekday
                contributionCount
              }
            }
          }
        }
      }
    }
  `;

  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { login: USERNAME } }),
  });

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`);
  }

  return json.data.user.contributionsCollection.contributionCalendar.weeks;
}

// Map a raw contribution count to a 0-4 intensity level, roughly matching
// GitHub's own quantile buckets.
function levelFor(count) {
  if (count === 0) return 0;
  if (count < 3) return 1;
  if (count < 6) return 2;
  if (count < 10) return 3;
  return 4;
}

// Small deterministic pseudo-random generator so re-runs on the same data
// produce the same-looking motion (avoids visual jitter between daily runs).
function seededRandom(seed) {
  let x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function buildSvg(weeks, palette) {
  const cols = weeks.length;
  const rows = 7;
  const width = MARGIN * 2 + cols * (CELL + GAP) - GAP;
  const height = MARGIN * 2 + rows * (CELL + GAP) - GAP;

  let cells = "";

  weeks.forEach((week, col) => {
    week.contributionDays.forEach((day) => {
      const row = day.weekday;
      const level = levelFor(day.contributionCount);
      const x = MARGIN + col * (CELL + GAP);
      const y = MARGIN + row * (CELL + GAP);
      const fill = palette[level];
      const seedIndex = col * rows + row;

      if (level === 0) {
        cells += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${fill}"/>\n`;
      } else {
        // Amplitude and speed scale with intensity; phase is randomized per
        // cell so floating days don't move in lockstep.
        const amp = (1.5 + level * 1.2).toFixed(2);
        const dur = (2.6 + seededRandom(seedIndex) * 1.8).toFixed(2);
        const delay = (seededRandom(seedIndex + 100) * dur).toFixed(2);
        const title = `${day.date}: ${day.contributionCount} contribution${day.contributionCount === 1 ? "" : "s"}`;

        cells += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${fill}">
  <title>${title}</title>
  <animateTransform attributeName="transform" type="translate"
    values="0 0; 0 -${amp}; 0 0; 0 ${amp}; 0 0"
    dur="${dur}s" begin="-${delay}s" repeatCount="indefinite"
    calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1"/>
</rect>\n`;
      }
    });
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="100%" height="100%" fill="transparent"/>
${cells}</svg>`;
}

async function main() {
  console.log(`Fetching contribution data for ${USERNAME}...`);
  const weeks = await fetchContributions();

  const outDir = path.join(__dirname, "dist");
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(
    path.join(outDir, "floating-graph.svg"),
    buildSvg(weeks, PALETTES.light)
  );
  fs.writeFileSync(
    path.join(outDir, "floating-graph-dark.svg"),
    buildSvg(weeks, PALETTES.dark)
  );

  console.log("Wrote dist/floating-graph.svg and dist/floating-graph-dark.svg");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
