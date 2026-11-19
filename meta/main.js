
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

async function loadData() {
  const data = await d3.csv('loc.csv', (row) => ({
    ...row,
    line: Number(row.line),
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(row.date + 'T00:00' + row.timezone),
    datetime: new Date(row.datetime),
  }));

  return data;
}

function processCommits(data) {
  return d3
    .groups(data, (d) => d.commit)
    .map(([commit, lines]) => {
      const first = lines[0];
      const { author, date, time, timezone, datetime } = first;

      const result = {
        id: commit,
        url: 'https://github.com/audreymiller343/portfolio/commit/' + commit,
        author,
        date,
        time,
        timezone,
        datetime,
        hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
        totalLines: lines.length,
      };

      Object.defineProperty(result, 'lines', {
        value: lines,
        enumerable: false,
        writable: false,
        configurable: false,
      });

      return result;
    })
    .sort((a, b) => a.datetime - b.datetime);
}

function renderCommitInfo(data, commits) {
  const fileLengths = d3.rollups(
    data,
    (rows) => d3.max(rows, (d) => d.line),
    (d) => d.file
  );

  const stats = [
    ['Commits', commits.length],
    ['Files', d3.group(data, (d) => d.file).size],
    ['Total LOC', data.length],
    ['Max depth', d3.max(data, (d) => d.depth)],
    ['Longest line', d3.max(data, (d) => d.length)],
    ['Max lines', d3.max(fileLengths, (d) => d[1])],
  ];

  const container = d3.select('#stats');

  container.selectAll('*').remove();

  const dl = container
    .append('dl')
    .attr('class', 'stats');

  stats.forEach(([label, value]) => {
    dl.append('dt').text(label);
    dl.append('dd').text(value);
  });
}

function renderTooltipContent(commit) {
  if (!commit) {
    return;
  }

  const link = document.getElementById('commit-link');
  const date = document.getElementById('commit-date');
  const time = document.getElementById('tooltip-time');
  const author = document.getElementById('commit-author');
  const lines = document.getElementById('commit-lines');

  link.href = commit.url;
  link.textContent = commit.id;

  date.textContent = commit.datetime.toLocaleDateString('en-US', {
    dateStyle: 'full',
  });

  time.textContent = commit.datetime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  author.textContent = commit.author || 'Unknown';
  lines.textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
  document.getElementById('commit-tooltip').hidden = !isVisible;
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById('commit-tooltip');
  const offset = 16;

  let left = event.clientX + offset;
  let top = event.clientY + offset;

  const tooltipWidth = tooltip.offsetWidth;
  const tooltipHeight = tooltip.offsetHeight;

  if (left + tooltipWidth > window.innerWidth - 8) {
    left = event.clientX - tooltipWidth - offset;
  }

  if (top + tooltipHeight > window.innerHeight - 8) {
    top = event.clientY - tooltipHeight - offset;
  }

  tooltip.style.left = `${Math.max(8, left)}px`;
  tooltip.style.top = `${Math.max(8, top)}px`;
}

function renderSelectionCount(selectedCommits) {
  const countElement = document.getElementById('selection-count');
  const count = selectedCommits.length;

  countElement.textContent =
    `${count || 'No'} commit${count === 1 ? '' : 's'} selected`;
}

function renderLanguageBreakdown(selectedCommits) {
  const container = d3.select('#language-breakdown');

  container.selectAll('*').remove();

  if (selectedCommits.length === 0) {
    return;
  }

  const lines = selectedCommits.flatMap((commit) => commit.lines);

  const breakdown = d3.rollups(
    lines,
    (items) => items.length,
    (line) => line.type || 'Unknown'
  );

  const sortedBreakdown = d3.sort(
    breakdown,
    (d) => -d[1]
  );

  for (const [language, count] of sortedBreakdown) {
    const proportion = count / lines.length;
    const formatted = d3.format('.1~%')(proportion);

    container.append('dt')
      .text(language);

    container.append('dd')
      .text(`${count} lines (${formatted})`);
  }
}

function renderScatterPlot(commits) {
  const width = 1000;
  const height = 600;

  const margin = {
    top: 10,
    right: 10,
    bottom: 30,
    left: 60,
  };

  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('overflow', 'visible');

  const xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();

  const yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);

  const gridlines = svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`);

  gridlines.call(
    d3.axisLeft(yScale)
      .tickFormat('')
      .tickSize(-usableArea.width)
  );

  const brushLayer = svg
    .append('g')
    .attr('class', 'brush');

  const dots = svg
    .append('g')
    .attr('class', 'dots');

  const xAxis = d3.axisBottom(xScale);

  const yAxis = d3
    .axisLeft(yScale)
    .tickFormat((d) => String(d % 24).padStart(2, '0') + ':00');

  const xAxisGroup = svg
    .append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0, ${usableArea.bottom})`);

  svg
    .append('g')
    .attr('class', 'y-axis')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(yAxis);

  function isCommitSelected(selection, commit) {
    if (!selection) {
      return false;
    }

    const [[x0, y0], [x1, y1]] = selection;
    const x = xScale(commit.datetime);
    const y = yScale(commit.hourFrac);

    return x >= x0 && x <= x1 && y >= y0 && y <= y1;
  }

  let visibleCommits = commits;

  function brushed(event) {
    const selection = event.selection;

    const selectedCommits = selection
      ? visibleCommits.filter((commit) =>
          isCommitSelected(selection, commit)
        )
      : [];

    dots
      .selectAll('circle')
      .classed('selected', (commit) =>
        selectedCommits.includes(commit)
      );

    renderSelectionCount(selectedCommits);
    renderLanguageBreakdown(selectedCommits);
  }

  const brush = d3
    .brush()
    .extent([
      [usableArea.left, usableArea.top],
      [usableArea.right, usableArea.bottom],
    ])
    .on('start brush end', brushed);

  brushLayer.call(brush);

  brushLayer.lower();
  dots.raise();

  function updateScatterPlot(filteredCommits) {
    visibleCommits = filteredCommits;
    xScale.domain(d3.extent(filteredCommits, (d) => d.datetime)).nice();
    xAxisGroup.call(xAxis);

    const rScale = d3.scaleSqrt()
      .domain(d3.extent(filteredCommits, (d) => d.totalLines))
      .range([2, 30]);
    const sortedCommits = d3.sort(filteredCommits, (d) => -d.totalLines);

    updateTooltipVisibility(false);
    dots
      .selectAll('circle')
      .data(sortedCommits, (d) => d.id)
      .join('circle')
      .classed('current', (commit) => commit === filteredCommits.at(-1))
      .attr('cx', (d) => xScale(d.datetime))
      .attr('cy', (d) => yScale(d.hourFrac))
      .attr('r', (d) => rScale(d.totalLines))
      .attr('fill', 'steelblue')
      .style('fill-opacity', 0.7)
      .on('mouseenter', (event, commit) => {
        d3.select(event.currentTarget)
          .style('fill-opacity', 1);

        renderTooltipContent(commit);
        updateTooltipVisibility(true);
        updateTooltipPosition(event);
      })
      .on('mousemove', (event) => {
        updateTooltipPosition(event);
      })
      .on('mouseleave', (event) => {
        d3.select(event.currentTarget)
          .style('fill-opacity', 0.7);

        updateTooltipVisibility(false);
      });

    brushed({ selection: d3.brushSelection(brushLayer.node()) });
  }

  return updateScatterPlot;
}

const colors = d3.scaleOrdinal(d3.schemeTableau10);

function updateFileDisplay(filteredCommits) {
  const lines = filteredCommits.flatMap((commit) => commit.lines);
  const files = d3.groups(lines, (line) => line.file)
    .map(([name, lines]) => ({ name, lines }))
    .sort((a, b) => b.lines.length - a.lines.length);

  const rows = d3.select('#files')
    .selectChildren('div')
    .data(files, (file) => file.name)
    .join((enter) => enter.append('div').call((row) => {
      const label = row.append('dt');
      label.append('code');
      label.append('small');
      row.append('dd');
    }));

  rows.select('code').text((file) => file.name);
  rows.select('small').text((file) => `${file.lines.length} lines`);
  rows.select('dd')
    .selectAll('div')
    .data((file) => file.lines)
    .join('div')
    .attr('class', 'loc')
    .classed('current', (line) => line.commit === filteredCommits.at(-1)?.id)
    .style('--color', (line) => colors(line.type));
}

const data = await loadData();
const commits = processCommits(data);
renderCommitInfo(data, commits);
const updateScatterPlot = renderScatterPlot(commits);

let commitProgress = 100;
const timeScale = d3.scaleTime()
  .domain(d3.extent(commits, (commit) => commit.datetime))
  .range([0, 100]);
let commitMaxTime = timeScale.invert(commitProgress);
const slider = document.getElementById('commit-progress');
const cutoff = document.getElementById('commit-time');
const playButton = document.getElementById('play-history');
let playbackTimer;

function stopPlayback() {
  clearInterval(playbackTimer);
  playbackTimer = undefined;
  playButton.textContent = 'Play';
}

function updateCommitFilter() {
  cutoff.dateTime = commitMaxTime.toISOString();
  cutoff.textContent = commitMaxTime.toLocaleString('en', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  const filteredCommits = commits.filter((commit) => commit.datetime <= commitMaxTime);
  updateScatterPlot(filteredCommits);
  updateFileDisplay(filteredCommits);
}

function onTimeSliderChange() {
  stopPlayback();
  commitProgress = slider.valueAsNumber;
  commitMaxTime = timeScale.invert(commitProgress);
  updateCommitFilter();
}

slider.addEventListener('input', onTimeSliderChange);
onTimeSliderChange();

d3.select('#scatter-story')
  .selectAll('.step')
  .data(commits)
  .join('div')
  .attr('class', 'step')
  .html((commit, index) => {
    const date = commit.datetime.toLocaleString('en', {
      dateStyle: 'full',
      timeStyle: 'short',
    });
    const fileCount = d3.group(commit.lines, (line) => line.file).size;
    const linkText = index === 0 ? 'my first recorded commit' : 'another commit';
    return `<p>On ${date}, I made <a href="${commit.url}" target="_blank">${linkText}</a>.</p>
      <p>I edited <strong>${commit.totalLines}</strong> lines across
      <strong>${fileCount}</strong> ${fileCount === 1 ? 'file' : 'files'}.</p>`;
  });

function showCommit(commit) {
  commitMaxTime = commit.datetime;
  commitProgress = timeScale(commitMaxTime);
  slider.value = commitProgress;
  updateCommitFilter();
}

playButton.addEventListener('click', () => {
  if (playbackTimer !== undefined) {
    stopPlayback();
    return;
  }

  let index = 0;
  playButton.textContent = 'Pause';
  showCommit(commits[index]);
  if (commits.length === 1) {
    stopPlayback();
    return;
  }

  playbackTimer = setInterval(() => {
    showCommit(commits[++index]);
    if (index === commits.length - 1) {
      stopPlayback();
    }
  }, 750);
});

function onStepEnter({ element }) {
  stopPlayback();
  showCommit(element.__data__);
}

scrollama()
  .setup({
    container: '#scrolly-1',
    step: '#scrolly-1 .step',
  })
  .onStepEnter(onStepEnter);
