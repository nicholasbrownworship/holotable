document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".nav-view").forEach((v) => v.classList.add("hidden"));
    document.getElementById(btn.dataset.nav).classList.remove("hidden");
  });
});
