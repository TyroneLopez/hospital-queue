// utils/predictionEngine.ts

// --- 1. MATH UTILITIES (The "Math Major" Core) ---

// Solves Ax = B using Gaussian Elimination
const solveMatrix = (A: number[][], B: number[]): number[] => {
    const n = A.length;
    // Forward elimination
    for (let i = 0; i < n; i++) {
        let maxRow = i;
        for (let k = i + 1; k < n; k++) {
            if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
        }
        [A[i], A[maxRow]] = [A[maxRow], A[i]];
        [B[i], B[maxRow]] = [B[maxRow], B[i]];

        for (let k = i + 1; k < n; k++) {
            const factor = A[k][i] / A[i][i];
            B[k] -= factor * B[i];
            for (let j = i; j < n; j++) A[k][j] -= factor * A[i][j];
        }
    }
    // Back substitution
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
        let sum = 0;
        for (let j = i + 1; j < n; j++) sum += A[i][j] * x[j];
        x[i] = (B[i] - sum) / A[i][i];
    }
    return x;
};

// Calculates Polynomial Coefficients (Least Squares Fitting)
// Degree 2 = Parabola, Degree 3 = Cubic Curve
const trainPolynomial = (data: {x: number, y: number}[], degree: number) => {
    const X: number[] = new Array(2 * degree + 1).fill(0);
    const Y: number[] = new Array(degree + 1).fill(0);

    for (const point of data) {
        for (let i = 0; i < 2 * degree + 1; i++) {
            X[i] += Math.pow(point.x, i);
        }
        for (let i = 0; i < degree + 1; i++) {
            Y[i] += point.y * Math.pow(point.x, i);
        }
    }

    const B: number[][] = [];
    for (let i = 0; i <= degree; i++) {
        const row: number[] = [];
        for (let j = 0; j <= degree; j++) {
            row.push(X[i + j]);
        }
        B.push(row);
    }

    return solveMatrix(B, Y);
};

// --- 2. THE MODEL CANDIDATES ---

// MODEL A: Exponential Weighted Moving Average (Reacts to recent changes)
const predictEWMA = (data: {y: number}[]) => {
    const alpha = 0.3; // Weight for most recent data (30%)
    let ema = data[0].y;
    for (let i = 1; i < data.length; i++) {
        ema = (alpha * data[i].y) + ((1 - alpha) * ema);
    }
    return ema;
};

// MODEL B: Polynomial Regression (Captures Time-of-Day Trends)
const predictPoly = (coeffs: number[], x: number) => {
    let y = 0;
    for (let i = 0; i < coeffs.length; i++) {
        y += coeffs[i] * Math.pow(x, i);
    }
    return y;
};

// --- 3. THE "BRAIN" (Dynamic Selection) ---

export const getDynamicPrediction = (data: {x: number, y: number}[], targetTimeOfDay: number) => {
    // Safety: Need enough data points
    if (data.length < 5) {
        // Fallback to simple average if data is scarce
        return data.reduce((sum, p) => sum + p.y, 0) / data.length;
    }

    // 1. Train Polynomial (Degree 3 - Cubic)
    // We use Cubic to capture Morning/Lunch/Afternoon curves
    const polyCoeffs = trainPolynomial(data, 3);
    const polyPrediction = predictPoly(polyCoeffs, targetTimeOfDay);

    // 2. Train EWMA (Recent Bias)
    const ewmaPrediction = predictEWMA(data);

    // 3. Evaluate "Goodness of Fit" (MSE)
    // We test which model explains the *existing* data better
    let polyError = 0;
    let ewmaError = 0;

    data.forEach(p => {
        polyError += Math.pow(p.y - predictPoly(polyCoeffs, p.x), 2);
        ewmaError += Math.pow(p.y - ewmaPrediction, 2); // EWMA is a flat line prediction here
    });

    // 4. JUDGMENT DAY
    // If the data is chaotic/noisy, EWMA is safer.
    // If the data follows a smooth curve, Polynomial is smarter.
    
    console.log(`🧠 MSE Comparison -> Poly: ${polyError.toFixed(0)} vs EWMA: ${ewmaError.toFixed(0)}`);

    if (polyError < ewmaError) {
         // Clamp the polynomial result (prevent negative time or infinite spikes)
         // A common issue with polynomials is shooting to infinity at the edges
         const minTime = 5 * 60000; // 5 mins
         const maxTime = 60 * 60000; // 1 hour
         return Math.min(Math.max(polyPrediction, minTime), maxTime);
    } else {
        return ewmaPrediction;
    }
};