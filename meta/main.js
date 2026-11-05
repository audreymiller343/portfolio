
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

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
    });
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
  const time = document.getElementById('commit-time');
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

function renderScatterPlot(data, commits) {
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

  const [minLines, maxLines] = d3.extent(
    commits,
    (d) => d.totalLines
  );

  const rScale = d3
    .scaleSqrt()
    .domain([minLines, maxLines])
    .range([2, 30]);

  const sortedCommits = d3.sort(
    commits,
    (d) => -d.totalLines
  );

  const brushLayer = svg
    .append('g')
    .attr('class', 'brush');

  const dots = svg
    .append('g')
    .attr('class', 'dots');

  dots
    .selectAll('circle')
    .data(sortedCommits)
    .join('circle')
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

  const xAxis = d3.axisBottom(xScale);

  const yAxis = d3
    .axisLeft(yScale)
    .tickFormat((d) => String(d % 24).padStart(2, '0') + ':00');

  svg
    .append('g')
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .call(xAxis);

  svg
    .append('g')
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

  function brushed(event) {
    const selection = event.selection;

    const selectedCommits = selection
      ? commits.filter((commit) =>
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
}

let data = await loadData();
let commits = processCommits(data);

renderCommitInfo(data, commits);
renderScatterPlot(data, commits);
