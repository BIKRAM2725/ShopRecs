import React, { useEffect, useRef, useState } from "react";

import axios from "axios";

import { useParams } from "react-router-dom";

import {
  FiShoppingCart,
  FiBell,
  FiCheck,
  FiTrendingDown,
  FiTrendingUp,
  FiMinus,
  FiExternalLink,
  FiPackage,
  FiRefreshCw,
  FiShield,
  FiClock,
} from "react-icons/fi";

import { BsStars } from "react-icons/bs";

import { TbChartLine } from "react-icons/tb";

import { Chart, registerables } from "chart.js";

Chart.register(...registerables);

function useToast() {
  const [toasts, setToasts] = useState([]);

  const show = (message, type = "info") => {
    const id = Date.now();

    setToasts((p) => [
      ...p,
      {
        id,
        msg: message,
        type,
      },
    ]);

    setTimeout(
      () =>
        setToasts((p) =>
          p.filter((t) => t.id !== id)
        ),
      3400
    );
  };

  return {
    toasts,
    show,
  };
}

const API = import.meta.env.VITE_API_URL;

const INR = (v) =>
  v != null
    ? `₹${Number(v).toLocaleString("en-IN")}`
    : "N/A";

const fmtDateShort = (d) =>
  new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });

const fmtDateLong = (d) =>
  new Date(d).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

function Toast({ toasts }) {
  const styles = {
    wrap: {
      position: "fixed",
      top: 16,
      right: 16,
      display: "flex",
      flexDirection: "column",
      gap: 8,
      zIndex: 999,
    },
  };

  const colors = {
    success: {
      bg: "#ecfdf5",
      color: "#1E7E50",
      border: "#a7f3d0",
    },

    warn: {
      bg: "#fffbeb",
      color: "#92400e",
      border: "#fde68a",
    },

    error: {
      bg: "#fef2f2",
      color: "#991b1b",
      border: "#fecaca",
    },

    info: {
      bg: "#eff6ff",
      color: "#1e40af",
      border: "#bfdbfe",
    },
  };

  return (
    <div style={styles.wrap}>
      {toasts.map(({ id, msg, type }) => {
        const c =
          colors[type] || colors.info;

        return (
          <div
            key={id}
            style={{
              background: c.bg,
              color: c.color,
              border: `0.5px solid ${c.border}`,
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 500,
              animation: "slideIn .2s ease",
            }}
          >
            {msg}
          </div>
        );
      })}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div
      style={{
        background:
          "var(--stat-bg, #f8f9fa)",
        borderRadius: 10,
        padding: "12px 10px",
        textAlign: "center",
      }}
    >
      <p
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "#9ca3af",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 4,
        }}
      >
        {label}
      </p>

      <p
        style={{
          fontSize: 15,
          fontWeight: 700,
          fontFamily:
            "'DM Mono', monospace",
          color,
        }}
      >
        {value}
      </p>
    </div>
  );
}

export default function ProductDetails() {
  const { id } = useParams();

  const [product, setProduct] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [showAlert, setShowAlert] =
    useState(false);

  const [alertPrice, setAlertPrice] =
    useState("");

  const [aiLoading, setAiLoading] =
    useState(false);

  const [aiResult, setAiResult] =
    useState("");

  const [aiDone, setAiDone] =
    useState(false);

  const chartRef =
    useRef(null);

  const chartInstance =
    useRef(null);

  const {
    toasts,
    show: toast,
  } = useToast();

  useEffect(() => {
    fetchProduct();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchProduct = async () => {
    setLoading(true);

    try {
      const { data } =
        await axios.get(
          `${API}/api/products/${id}`
        );

      setProduct(data.product);
    } catch (err) {
      console.error(
        "fetchProduct error:",
        err?.response?.data ||
          err.message
      );

      toast(
        "Failed to load product.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (
      !product ||
      !chartRef.current
    ) {
      return;
    }

    const sorted = [
      ...(product.history || []),
      {
        price: product.currentPrice,
        checkedAt:
          product.lastChecked,
      },
    ].sort(
      (a, b) =>
        new Date(a.checkedAt) -
        new Date(b.checkedAt)
    );

    const labels = sorted.map(
      (h) =>
        fmtDateShort(
          h.checkedAt
        )
    );

    const tooltipLabels =
      sorted.map((h) =>
        fmtDateLong(
          h.checkedAt
        )
      );

    const prices = sorted.map(
      (h) => h.price
    );

    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx =
      chartRef.current.getContext(
        "2d"
      );

    const grad =
      ctx.createLinearGradient(
        0,
        0,
        0,
        220
      );

    grad.addColorStop(
      0,
      "rgba(30,126,80,0.18)"
    );

    grad.addColorStop(
      1,
      "rgba(30,126,80,0)"
    );

    chartInstance.current =
      new Chart(ctx, {
        type: "line",

        data: {
          labels,

          datasets: [
            {
              label: "Price",

              data: prices,

              borderColor:
                "#1E7E50",

              borderWidth: 2.5,

              backgroundColor: grad,

              fill: true,

              tension: 0.4,

              pointBackgroundColor:
                "#1E7E50",

              pointBorderColor:
                "#fff",

              pointBorderWidth: 2,

              pointRadius: 5,

              pointHoverRadius: 7,

              pointHoverBorderWidth: 2,
            },
          ],
        },

        options: {
          responsive: true,

          maintainAspectRatio: false,

          plugins: {
            legend: {
              display: false,
            },

            tooltip: {
              backgroundColor:
                "#fff",

              borderColor:
                "rgba(0,0,0,0.1)",

              borderWidth: 1,

              titleColor:
                "#6b7280",

              bodyColor:
                "#111827",

              titleFont: {
                family:
                  "'DM Sans', sans-serif",
                size: 11,
                weight: "400",
              },

              bodyFont: {
                family:
                  "'DM Mono', monospace",
                size: 15,
                weight: "600",
              },

              padding: 12,

              cornerRadius: 10,

              displayColors: false,

              callbacks: {
                title: (items) =>
                  tooltipLabels[
                    items[0]
                      .dataIndex
                  ],

                label: (item) =>
                  INR(item.raw),
              },
            },
          },

          scales: {
            x: {
              grid: {
                color:
                  "rgba(0,0,0,0.05)",
              },

              ticks: {
                color:
                  "#9ca3af",

                font: {
                  family:
                    "'DM Sans'",
                  size: 11,
                },
              },
            },

            y: {
              grid: {
                color:
                  "rgba(0,0,0,0.05)",
              },

              ticks: {
                color:
                  "#9ca3af",

                font: {
                  family:
                    "'DM Mono'",
                  size: 11,
                },

                callback: (v) =>
                  `₹${(
                    v / 1000
                  ).toFixed(1)}k`,
              },
            },
          },
        },
      });

    return () =>
      chartInstance.current?.destroy();
  }, [product]);

  const handleSetAlert = () => {
    if (!alertPrice) {
      return toast(
        "Please enter a target price.",
        "warn"
      );
    }

    if (
      parseInt(alertPrice) >=
      product.currentPrice
    ) {
      return toast(
        "Alert price must be below current price.",
        "warn"
      );
    }

    toast(
      `Alert set at ${INR(
        parseInt(alertPrice)
      )} ✓`,
      "success"
    );

    setAlertPrice("");

    setShowAlert(false);
  };

  const runAiAnalysis = async () => {
    if (
      (product?.history || [])
        .length < 3
    ) {
      toast(
        `AI analysis requires at least 3 historical checks. Currently: ${
          (product?.history || [])
            .length
        }`,
        "warn"
      );

      return;
    }

    if (!product?._id) {
      toast(
        "Product ID not found.",
        "error"
      );

      return;
    }

    setAiLoading(true);

    setAiDone(false);

    setAiResult(null);

    const nodeUrl =
      `${API}/api/products/${product._id}/predict`;

    try {
      let resp;

      try {
        resp =
          await axios.post(
            nodeUrl
          );
      } catch (postErr) {
        if (
          postErr?.response?.status ===
            404 ||
          postErr?.response?.status ===
            405 ||
          postErr?.response?.status ===
            501
        ) {
          resp =
            await axios.get(
              nodeUrl
            );
        } else {
          try {
            resp =
              await axios.get(
                nodeUrl
              );
          } catch (
            getErr
          ) {
            throw postErr;
          }
        }
      }

      const data = resp?.data;

      if (!data) {
        throw new Error(
          "No response from server"
        );
      }

      if (
        !data.success &&
        !data.ai &&
        !data.finalDecision &&
        !data.recommendation
      ) {
        throw new Error(
          data.message ||
            "AI analysis failed"
        );
      }

      const ai =
        data.ai ?? data;

      const normalized = {
        currentPrice:
          ai.currentPrice ??
          ai.current_price ??
          product.currentPrice,

        finalDecision:
          ai.finalDecision ??
          ai.recommendation ??
          ai.recommendation_text ??
          ai.final_decision ??
          ai.decision ??
          ai.finalRecommendation ??
          "N/A",

        expectedDropPercent:
          ai.expectedDropPercent ??
          ai.expected_drop_percent ??
          ai.expectedDrop ??
          ai.expected_drop ??
          ai.expected_drop_percent_formatted ??
          null,

        volatility:
          ai.volatility ??
          ai.priceTrendVolatility ??
          ai.volatility_value ??
          null,

        lowestHistoricalPrice:
          ai.lowestHistoricalPrice ??
          ai.lowest_historical ??
          ai.lowestHistorical ??
          (
            Array.isArray(
              product.history
            ) &&
            product.history.length
              ? Math.min(
                  ...product.history.map(
                    (h) => h.price
                  )
                )
              : product.currentPrice
          ),

        explanation:
          ai.explanation ??
          ai.reason ??
          ai.insight ??
          ai.summary ??
          "",

        raw: ai,
      };

      setAiResult(
        normalized
      );

      setAiDone(true);

      toast(
        "AI analysis completed",
        "success"
      );
    } catch (err) {
      console.error(
        "AI analysis error:",
        err?.response?.data ||
          err.message ||
          err
      );

      toast(
        err?.response?.data
          ?.message ||
          err.message ||
          "AI analysis failed.",
        "error"
      );
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems:
            "center",
          justifyContent:
            "center",
          height: "100vh",
          flexDirection:
            "column",
          gap: 16,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            border:
              "3px solid #e5e7eb",
            borderTopColor:
              "#1E7E50",
            borderRadius: "50%",
            animation:
              "spin 0.8s linear infinite",
          }}
        />

        <p
          style={{
            color:
              "#9ca3af",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          Loading product…
        </p>
      </div>
    );
  }

  if (!product) {
    return (
      <p
        style={{
          textAlign: "center",
          marginTop: 80,
          color:
            "#dc2626",
          fontWeight: 600,
        }}
      >
        Product not found.
      </p>
    );
  }

  const discount =
    product.mrp &&
    product.currentPrice
      ? Math.round(
          ((product.mrp -
            product.currentPrice) /
            product.mrp) *
            100
        )
      : 0;

  const historyPrices =
    (product.history || []).map(
      (h) => h.price
    );

  const highestPrice =
    historyPrices.length
      ? Math.max(
          ...historyPrices
        )
      : product.mrp;

  const lowestPrice =
    historyPrices.length
      ? Math.min(
          ...historyPrices
        )
      : product.currentPrice;

  const avgPrice =
    historyPrices.length
      ? Math.round(
          historyPrices.reduce(
            (a, b) => a + b,
            0
          ) /
            historyPrices.length
        )
      : product.currentPrice;

  const savedAmount =
    product.mrp &&
    product.currentPrice
      ? product.mrp -
        product.currentPrice
      : 0;

  const latestPrice =
    historyPrices[
      historyPrices.length - 1
    ];

  const previousPrice =
    historyPrices[
      historyPrices.length - 2
    ];

  const priceDropped =
    latestPrice != null &&
    previousPrice != null &&
    latestPrice <
      previousPrice;

  const sourceBg = {
    amazon:
      "#FF9900",
    flipkart:
      "#2874f0",
  }[product.source] ||
    "#ec4899";

  const historyCount =
    (product.history || [])
      .length;

  const S = {
    page: {
      maxWidth: 1100,
      margin: "0 auto",
      padding: "2rem 1.25rem",
      display: "flex",
      flexDirection:
        "column",
      gap: "1.25rem",
      fontFamily:
        "'DM Sans', -apple-system, sans-serif",
    },
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500;600&display=swap');

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(8px);
          }

          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        * {
          box-sizing: border-box;
        }

        @media (max-width: 768px) {
          .top-grid {
            grid-template-columns: 1fr !important;
          }

          .bot-grid {
            grid-template-columns: 1fr !important;
          }

          .stats-grid {
            grid-template-columns: repeat(2,1fr) !important;
          }
        }
      `}</style>

      <Toast toasts={toasts} />

      <div style={S.page}>
        <p
          style={{
            fontSize: 12,
            color: "#9ca3af",
            display: "flex",
            gap: 6,
          }}
        >
          Dashboard{" "}
          <span
            style={{
              color:
                "#d1d5db",
            }}
          >
            /
          </span>

          <span
            style={{
              color:
                "#1E7E50",
              fontWeight: 600,
            }}
          >
            Product Details
          </span>
        </p>

        <div
          className="top-grid"
          style={{
            display: "grid",
            gridTemplateColumns:
              "1fr 1.35fr",
            gap: "1.25rem",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding:
                "1.5rem",
              minHeight: 360,
              alignItems:
                "center",
              justifyContent:
                "center",
            }}
          >
            <span
              style={{
                position:
                  "absolute",
                top: 14,
                left: 14,
                background:
                  sourceBg,
                color: "#fff",
                fontSize: 10,
                fontWeight: 700,
                padding:
                  "4px 10px",
                borderRadius: 20,
                textTransform:
                  "uppercase",
              }}
            >
              {product.source}
            </span>

            <span
              style={{
                position:
                  "absolute",
                top: 14,
                right: 14,
                background:
                  product.inStock
                    ? "#ecfdf5"
                    : "#fef2f2",
                color:
                  product.inStock
                    ? "#1E7E50"
                    : "#dc2626",
                border: `0.5px solid ${
                  product.inStock
                    ? "#a7f3d0"
                    : "#fecaca"
                }`,
                fontSize: 11,
                fontWeight: 600,
                padding:
                  "4px 10px",
                borderRadius: 20,
                display: "flex",
                alignItems:
                  "center",
                gap: 4,
              }}
            >
              {product.inStock ? (
                <FiCheck
                  size={11}
                />
              ) : (
                <FiMinus
                  size={11}
                />
              )}
            </span>

            {product.image ? (
              <img
                src={
                  product.image
                }
                alt={
                  product.title
                }
                style={{
                  width: "100%",
                  maxHeight: 280,
                  objectFit:
                    "contain",
                  padding:
                    "1rem",
                }}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection:
                    "column",
                  alignItems:
                    "center",
                  gap: 10,
                  color:
                    "#9ca3af",
                }}
              >
                <FiPackage
                  size={40}
                />

                <p
                  style={{
                    fontSize: 13,
                  }}
                >
                  Image not available
                </p>
              </div>
            )}

            <p
              style={{
                fontSize: 11,
                color:
                  "#9ca3af",
                display: "flex",
                alignItems:
                  "center",
                gap: 4,
              }}
            >
              <FiRefreshCw
                size={11}
              />

              Last checked:{" "}
              {fmtDateLong(
                product.lastChecked
              )}
            </p>
          </div>

          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding:
                "1.5rem",
              display: "flex",
              flexDirection:
                "column",
              gap: "1rem",
            }}
          >
            <h1
              style={{
                fontSize: 15,
                fontWeight: 500,
                color:
                  "#111827",
                lineHeight: 1.55,
              }}
            >
              {product.title}
            </h1>

            <div
              style={{
                background:
                  "#f0fdf4",
                borderRadius: 12,
                padding:
                  "1rem 1.25rem",
                display: "flex",
                alignItems:
                  "baseline",
                gap: 10,
                flexWrap:
                  "wrap",
              }}
            >
              <span
                style={{
                  fontSize: 38,
                  fontWeight: 700,
                  color:
                    "#14532d",
                  fontFamily:
                    "'DM Mono', monospace",
                  letterSpacing:
                    -1,
                }}
              >
                {INR(
                  product.currentPrice
                )}
              </span>

              {product.mrp && (
                <span
                  style={{
                    fontSize: 17,
                    color:
                      "#9ca3af",
                    textDecoration:
                      "line-through",
                    fontFamily:
                      "'DM Mono', monospace",
                  }}
                >
                  {INR(
                    product.mrp
                  )}
                </span>
              )}

              {discount >
                0 && (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    padding:
                      "3px 9px",
                    borderRadius: 6,
                    background:
                      "#dcfce7",
                    color:
                      "#15803d",
                  }}
                >
                  {discount}% OFF
                </span>
              )}
            </div>

            {priceDropped && (
              <div
                style={{
                  background:
                    "#f0fdf4",
                  border:
                    "0.5px solid #a7f3d0",
                  borderRadius: 8,
                  padding:
                    "7px 12px",
                  fontSize: 12,
                  color:
                    "#1E7E50",
                  fontWeight: 500,
                  display: "flex",
                  alignItems:
                    "center",
                  gap: 6,
                }}
              >
                <FiTrendingDown
                  size={13}
                />

                Price dropped recently —
                was{" "}
                {INR(
                  previousPrice
                )}
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap:
                  "wrap",
              }}
            >
              <span
                style={{
                  display:
                    "flex",
                  alignItems:
                    "center",
                  gap: 5,
                  fontSize: 12,
                  color:
                    "#6b7280",
                  background:
                    "#f9fafb",
                  padding:
                    "5px 10px",
                  borderRadius: 8,
                }}
              >
                <FiShoppingCart
                  size={12}
                />

                <strong
                  style={{
                    textTransform:
                      "capitalize",
                  }}
                >
                  {product.source}
                </strong>
              </span>

              <span
                style={{
                  display:
                    "flex",
                  alignItems:
                    "center",
                  gap: 5,
                  fontSize: 12,
                  color:
                    "#6b7280",
                  background:
                    "#f9fafb",
                  padding:
                    "5px 10px",
                  borderRadius: 8,
                }}
              >
                <FiClock
                  size={12}
                />

                Tracked{" "}
                <strong
                  style={{
                    marginLeft: 3,
                  }}
                >
                  {historyCount}×
                </strong>
              </span>

              <span
                style={{
                  display:
                    "flex",
                  alignItems:
                    "center",
                  gap: 5,
                  fontSize: 12,
                  color:
                    "#6b7280",
                  background:
                    "#f9fafb",
                  padding:
                    "5px 10px",
                  borderRadius: 8,
                }}
              >
                <FiShield
                  size={12}
                />

                {product.inStock
                  ? "Available"
                  : "Currently unavailable"}
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "1fr 1fr",
                gap: 8,
                marginTop: 4,
              }}
            >
              <a
                href={
                  product.url
                }
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background:
                    "#14532d",
                  color: "#fff",
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration:
                    "none",
                  display: "flex",
                  alignItems:
                    "center",
                  justifyContent:
                    "center",
                  gap: 6,
                }}
              >
                <FiExternalLink
                  size={14}
                />

                Buy Now
              </a>

              <button
                type="button"
                disabled
                style={{
                  background:
                    "transparent",
                  color:
                    "#374151",
                  border:
                    "0.5px solid rgba(0,0,0,0.15)",
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 13,
                  fontWeight: 500,
                }}
                onClick={() =>
                  setShowAlert(
                    (s) => !s
                  )
                }
              >
                <FiBell
                  size={14}
                />

                Set Alert
              </button>
            </div>

            {showAlert && (
              <div
                style={{
                  background:
                    "#fffbeb",
                  border:
                    "0.5px solid #fde68a",
                  borderRadius: 12,
                  padding:
                    "12px 14px",
                  display: "flex",
                  gap: 8,
                  alignItems:
                    "center",
                }}
              >
                <input
                  type="number"
                  value={
                    alertPrice
                  }
                  onChange={(e) =>
                    setAlertPrice(
                      e.target.value
                    )
                  }
                  placeholder={`Target price (below ${INR(
                    product.currentPrice
                  )})`}
                  style={{
                    flex: 1,
                    background:
                      "#fff",
                    border:
                      "0.5px solid rgba(0,0,0,0.12)",
                    borderRadius: 8,
                    padding:
                      "8px 10px",
                    fontSize: 13,
                    outline:
                      "none",
                  }}
                />

                <button
                  onClick={
                    handleSetAlert
                  }
                  style={{
                    background:
                      "#d97706",
                    color: "#fff",
                    border:
                      "none",
                    borderRadius: 8,
                    padding:
                      "8px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  Confirm
                </button>
              </div>
            )}
          </div>
        </div>

        <div
          className="bot-grid"
          style={{
            display: "grid",
            gridTemplateColumns:
              "1.65fr 1fr",
            gap: "1.25rem",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding:
                "1.5rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems:
                  "center",
                gap: 10,
                marginBottom: 16,
              }}
            >
              <TbChartLine
                size={16}
                color="#1E7E50"
              />

              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color:
                    "#6b7280",
                }}
              >
                Price History
              </div>
            </div>

            {historyCount >=
            2 ? (
              <div
                style={{
                  position:
                    "relative",
                  width: "100%",
                  height: 220,
                }}
              >
                <canvas
                  ref={chartRef}
                  role="img"
                  aria-label={`Price history chart for ${product.title}`}
                />
              </div>
            ) : (
              <div
                style={{
                  height: 220,
                  background:
                    "#f9fafb",
                  borderRadius: 10,
                  display: "flex",
                  alignItems:
                    "center",
                  justifyContent:
                    "center",
                  color:
                    "#9ca3af",
                  fontSize: 13,
                }}
              >
                Not enough history yet.
                Price history requires
                at least 2 saved checks.
              </div>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(4,1fr)",
                gap: 8,
                marginTop: 16,
              }}
            >
              <StatCard
                label="Highest"
                value={INR(
                  highestPrice
                )}
                color="#dc2626"
              />

              <StatCard
                label="Lowest"
                value={INR(
                  lowestPrice
                )}
                color="#1E7E50"
              />

              <StatCard
                label="Average"
                value={INR(
                  avgPrice
                )}
                color="#185FA5"
              />

              <StatCard
                label="You Save"
                value={INR(
                  savedAmount
                )}
                color="#1E7E50"
              />
            </div>
          </div>

          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding:
                "1.5rem",
              display: "flex",
              flexDirection:
                "column",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems:
                  "center",
                gap: 10,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  background:
                    "#1e1b4b",
                  borderRadius: 10,
                  display: "flex",
                  alignItems:
                    "center",
                  justifyContent:
                    "center",
                }}
              >
                <BsStars
                  size={17}
                  color="#c4b5fd"
                />
              </div>

              <div>
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color:
                      "#111827",
                  }}
                >
                  AI Price Analyst
                </p>

                <p
                  style={{
                    fontSize: 11,
                    color:
                      "#9ca3af",
                  }}
                >
                  Powered by Price Prediction AI
                </p>
              </div>
            </div>

            <div
              style={{
                flex: 1,
                background:
                  "#f9fafb",
                borderRadius: 12,
                padding: "1rem",
                fontSize: 13,
                minHeight: 130,
                border:
                  "0.5px solid rgba(0,0,0,0.06)",
                display: "flex",
                alignItems:
                  aiLoading
                    ? "center"
                    : "flex-start",
                justifyContent:
                  aiLoading
                    ? "center"
                    : "flex-start",
                flexDirection:
                  "column",
              }}
            >
              {aiLoading ? (
                <div
                  style={{
                    display:
                      "flex",
                    flexDirection:
                      "column",
                    alignItems:
                      "center",
                    gap: 10,
                    color:
                      "#9ca3af",
                    width: "100%",
                    justifyContent:
                      "center",
                    minHeight: 100,
                  }}
                >
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      border:
                        "2.5px solid #e5e7eb",
                      borderTopColor:
                        "#7c3aed",
                      borderRadius:
                        "50%",
                      animation:
                        "spin 0.8s linear infinite",
                    }}
                  />

                  <span
                    style={{
                      fontSize: 12,
                    }}
                  >
                    Analysing price trend…
                  </span>
                </div>
              ) : aiResult ? (
                <div
                  style={{
                    width: "100%",
                    display:
                      "flex",
                    flexDirection:
                      "column",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      background:
                        "#eff6ff",
                      border:
                        "0.5px solid #bfdbfe",
                      padding: 12,
                      borderRadius: 10,
                    }}
                  >
                    <p
                      style={{
                        fontSize: 11,
                        color:
                          "#1d4ed8",
                        fontWeight: 700,
                        marginBottom: 4,
                      }}
                    >
                      CURRENT PRICE
                    </p>

                    <p
                      style={{
                        fontSize: 24,
                        fontWeight: 700,
                        color:
                          "#111827",
                        fontFamily:
                          "'DM Mono', monospace",
                      }}
                    >
                      {INR(
                        aiResult.currentPrice
                      )}
                    </p>
                  </div>

                  <div
                    style={{
                      background:
                        aiResult.finalDecision ===
                        "BUY NOW"
                          ? "#ecfdf5"
                          : "#fef2f2",
                      border:
                        aiResult.finalDecision ===
                        "BUY NOW"
                          ? "0.5px solid #a7f3d0"
                          : "0.5px solid #fecaca",
                      padding: 12,
                      borderRadius: 10,
                    }}
                  >
                    <p
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        marginBottom: 4,
                        color:
                          aiResult.finalDecision ===
                          "BUY NOW"
                            ? "#15803d"
                            : "#dc2626",
                      }}
                    >
                      RECOMMENDATION
                    </p>

                    <p
                      style={{
                        fontSize: 20,
                        fontWeight: 700,
                        color:
                          aiResult.finalDecision ===
                          "BUY NOW"
                            ? "#15803d"
                            : "#dc2626",
                      }}
                    >
                      {
                        aiResult.finalDecision
                      }
                    </p>
                  </div>

                  <div
                    style={{
                      background:
                        "#faf5ff",
                      border:
                        "0.5px solid #d8b4fe",
                      padding: 12,
                      borderRadius: 10,
                    }}
                  >
                    <p
                      style={{
                        fontSize: 11,
                        color:
                          "#7e22ce",
                        fontWeight: 700,
                        marginBottom: 4,
                      }}
                    >
                      EXPECTED PRICE DROP
                    </p>

                    <p
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color:
                          "#581c87",
                      }}
                    >
                      {aiResult.expectedDropPercent ??
                        "N/A"}
                      %
                    </p>
                  </div>

                  <div
                    style={{
                      background:
                        "#f9fafb",
                      border:
                        "0.5px solid rgba(0,0,0,0.08)",
                      padding: 12,
                      borderRadius: 10,
                    }}
                  >
                    <p
                      style={{
                        fontSize: 11,
                        color:
                          "#6b7280",
                        fontWeight: 700,
                        marginBottom: 6,
                      }}
                    >
                      AI INSIGHT
                    </p>

                    <p
                      style={{
                        fontSize: 13,
                        lineHeight: 1.7,
                        color:
                          "#374151",
                      }}
                    >
                      {
                        aiResult.explanation
                      }
                    </p>
                  </div>

                  <div
                    style={{
                      display:
                        "grid",
                      gridTemplateColumns:
                        "1fr 1fr",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        background:
                          "#f9fafb",
                        padding: 10,
                        borderRadius: 10,
                      }}
                    >
                      <p
                        style={{
                          fontSize: 10,
                          color:
                            "#9ca3af",
                          marginBottom: 4,
                        }}
                      >
                        VOLATILITY
                      </p>

                      <p
                        style={{
                          fontWeight: 700,
                          fontSize: 14,
                        }}
                      >
                        {INR(
                          aiResult.volatility
                        )}
                      </p>
                    </div>

                    <div
                      style={{
                        background:
                          "#f9fafb",
                        padding: 10,
                        borderRadius: 10,
                      }}
                    >
                      <p
                        style={{
                          fontSize: 10,
                          color:
                            "#9ca3af",
                          marginBottom: 4,
                        }}
                      >
                        LOWEST
                      </p>

                      <p
                        style={{
                          fontWeight: 700,
                          fontSize: 14,
                        }}
                      >
                        {INR(
                          aiResult.lowestHistoricalPrice
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {historyCount <
                  3 ? (
                    <p
                      style={{
                        color:
                          "#9ca3af",
                        fontStyle:
                          "italic",
                        fontSize: 13,
                      }}
                    >
                      AI analysis requires at least 3 historical checks. Currently tracked:{" "}
                      {
                        historyCount
                      }
                      .
                    </p>
                  ) : (
                    <p
                      style={{
                        color:
                          "#9ca3af",
                        fontStyle:
                          "italic",
                        fontSize: 13,
                      }}
                    >
                      Click Analyse to get AI insights on this product's price trend.
                    </p>
                  )}
                </>
              )}
            </div>

            {aiDone && (
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  flexWrap:
                    "wrap",
                  marginTop: 10,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding:
                      "3px 9px",
                    borderRadius: 5,
                    background:
                      "#dcfce7",
                    color:
                      "#15803d",
                    display:
                      "flex",
                    alignItems:
                      "center",
                    gap: 4,
                  }}
                >
                  <FiTrendingDown
                    size={11}
                  />

                  Price Analysis
                </span>

                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding:
                      "3px 9px",
                    borderRadius: 5,
                    background:
                      "#ede9fe",
                    color:
                      "#6d28d9",
                    display:
                      "flex",
                    alignItems:
                      "center",
                    gap: 4,
                  }}
                >
                  <FiTrendingUp
                    size={11}
                  />

                  AI Prediction
                </span>
              </div>
            )}

            <button
              onClick={
                runAiAnalysis
              }
              disabled={
                aiLoading ||
                historyCount < 3
              }
              style={{
                marginTop: 12,
                background:
                  "linear-gradient(135deg,#4338ca,#7c3aed)",
                color: "#fff",
                border: "none",
                borderRadius: 12,
                padding: 12,
                fontSize: 13,
                fontWeight: 600,
                cursor:
                  aiLoading ||
                  historyCount < 3
                    ? "not-allowed"
                    : "pointer",
                display:
                  "flex",
                alignItems:
                  "center",
                justifyContent:
                  "center",
                gap: 6,
                opacity:
                  aiLoading ||
                  historyCount < 3
                    ? 0.65
                    : 1,
              }}
            >
              <BsStars
                size={14}
              />

              {aiLoading
                ? "Analysing…"
                : aiDone
                  ? "Re-analyse"
                  : "Analyse Price Trend"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
