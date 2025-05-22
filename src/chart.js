(async function () {
    const symbol = "NVDA";
    console.log("Fetching data for:", symbol);

    try {
        const response = await fetch(`http://localhost:3030/chart-data/${symbol}`);
        const data = await response.json();

        const labels = data.map(entry => new Date(entry.date).toLocaleDateString());
        const values = data.map(entry => entry.closePrice);

        const ctx = document.getElementById('myChart');

        if (Chart.getChart(ctx)) {
            Chart.getChart(ctx).destroy();
        }
        new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: `${symbol} Price`,
                    data: values,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1
                }]
            }
        });
        if (!ctx) {
            console.error("Canvas element not found");
        }

    } catch (err) {
        console.error("Error fetching or rendering chart:", err);
    }
})();
