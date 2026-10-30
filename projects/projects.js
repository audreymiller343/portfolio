
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { fetchJSON, renderProjects } from '../global.js';

const projects = await fetchJSON('../lib/projects.json');

const projectsContainer = document.querySelector('.projects');
const projectsTitle = document.querySelector('.projects-title');
const searchInput = document.querySelector('.searchBar');

let query = '';
let selectedYear = null;

const colors = d3.scaleOrdinal(d3.schemeTableau10);

function getSearchResults() {
  return projects.filter(project => {
    let values = Object.values(project)
      .join('\n')
      .toLowerCase();

    return values.includes(query.toLowerCase());
  });
}

function updateProjects() {
  let filteredProjects = getSearchResults().filter(project =>
    selectedYear === null ||
    String(project.year) === selectedYear
  );

  renderProjects(filteredProjects, projectsContainer, 'h2');
}

function selectYear(year) {
  selectedYear = selectedYear === year ? null : year;

  updateProjects();
  renderPieChart(getSearchResults());
}

function renderPieChart(projectsGiven) {
  let rolledData = d3.rollups(
    projectsGiven,
    v => v.length,
    d => d.year
  );

  let data = rolledData.map(([year, count]) => ({
    value: count,
    label: String(year)
  }));

  let arcGenerator = d3.arc()
    .innerRadius(0)
    .outerRadius(50);

  let sliceGenerator = d3.pie()
    .value(d => d.value);

  let arcData = sliceGenerator(data);
  let arcs = arcData.map(d => arcGenerator(d));

  let svg = d3.select('#projects-pie-plot');
  svg.selectAll('path').remove();

  let legend = d3.select('.legend');
  legend.selectAll('li').remove();

  arcs.forEach((arc, index) => {
    let year = data[index].label;

    svg.append('path')
      .attr('d', arc)
      .attr('fill', colors(year))
      .attr('class', selectedYear === year ? 'selected' : '')
      .attr('role', 'button')
      .attr('tabindex', 0)
      .attr('aria-label', `Filter projects from ${year}`)
      .on('click', () => selectYear(year))
      .on('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectYear(year);
        }
      });
  });

  data.forEach(d => {
    let year = d.label;

    legend
      .append('li')
      .attr(
        'class',
        selectedYear === year
          ? 'legend-item selected'
          : 'legend-item'
      )
      .attr('style', `--color: ${colors(year)}`)
      .html(`
        <span class="swatch"></span>
        ${d.label} <em>(${d.value})</em>
      `)
      .on('click', () => selectYear(year));
  });
}

if (projectsTitle && projects) {
  projectsTitle.textContent = `${projects.length} Projects`;
}

updateProjects();
renderPieChart(projects);

searchInput.addEventListener('input', event => {
  query = event.target.value;

  let searchResults = getSearchResults();

  if (
    selectedYear !== null &&
    !searchResults.some(
      project => String(project.year) === selectedYear
    )
  ) {
    selectedYear = null;
  }

  updateProjects();
  renderPieChart(searchResults);
});
