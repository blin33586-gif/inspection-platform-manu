const mapButtons = document.querySelectorAll(".map-label");
const tooltip = document.querySelector(".map-tooltip");

mapButtons.forEach((button) => {
  button.addEventListener("mouseenter", () => {
    if (!tooltip) return;
    const name = button.dataset.target || button.textContent.trim();
    tooltip.innerHTML = `<strong>${name}</strong><span>点击进入${button.classList.contains("road") ? "道路街面" : "小区"}档案</span>`;
  });

  button.addEventListener("click", () => {
    window.location.href = button.classList.contains("road") ? "./roads.html" : "./communities.html";
  });
});
