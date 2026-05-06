let count = 0;
const scoreElement = document.getElementById('score');
const clickButton = document.getElementById('clickBtn');
const messageElement = document.getElementById('message');

clickButton.addEventListener('click', () => {
    count++;
    scoreElement.textContent = count;

    // 점수에 따라 메시지 변경
    if (count === 10) {
        messageElement.textContent = "오, 좀 하시는데요? 👍";
        messageElement.style.color = "blue";
    } else if (count === 20) {
        messageElement.textContent = "와우! 20점 돌파! 🚀";
        messageElement.style.color = "red";
    }
});