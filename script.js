document.documentElement.classList.add("js-enabled");

document.querySelectorAll(".talk-details").forEach((details) => {
  const title = details.querySelector("h3");
  const speaker = details.querySelector(".speaker");

  if (title?.textContent === "Title (placeholder)" && speaker) {
    const [name, affiliation] = speaker.textContent.split(" — ");
    title.textContent = name;

    if (affiliation) {
      speaker.textContent = affiliation;
    } else {
      speaker.remove();
    }
  }
});

const dayButtons = document.querySelectorAll(".day-switch-button");
const daySchedules = document.querySelectorAll(".day-schedule");

dayButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const selectedDay = button.dataset.day;

    dayButtons.forEach((dayButton) => {
      const isSelected = dayButton === button;
      dayButton.classList.toggle("is-active", isSelected);
      dayButton.setAttribute("aria-selected", String(isSelected));
    });

    daySchedules.forEach((schedule) => {
      schedule.hidden = schedule.id !== selectedDay;
    });
  });
});
