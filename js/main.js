var DATASOURCE = 'wss://ws.blockchain.info/inv';
var CMD_SUBSCRIBE_BLOCKS = '{"op":"blocks_sub"}\n';
var CMD_SUBSCRIBE_TX = '{"op":"unconfirmed_sub"}\n';

var MAX_WINDOW_SIZE = 15 * 60 * 1000;
var MIN_WINDOW_SIZE = 30 * 1000;
var VERY_LOW_REFRESH_FREQUENCY = 5000;
var LOW_REFRESH_FREQUENCY = 1000;
var HIGH_REFRESH_FREQUENCY = 100;
var VERY_LOW_FREQUENCY_ABOVE = 90 * 60 * 1000;
var LOW_FREQUENCY_ABOVE = 20 * 60 * 1000;
var HIGH_FREQUENCY_BELOW = 5 * 60 * 1000;

var SATOSHIS_PER_BTC = 100000000;

var refresh_frequency = HIGH_REFRESH_FREQUENCY;
var window_size = 3 * 60 * 1000;

var plot_data = [];
var oldest_timestamp_needed = 0;
var max_ytick = 1;

var transaction_plot = [];
var transaction_info = [];
var block_plot = [];
var block_info = [];

var datapart = {};
var optionpart = {};
var previous_point = null;

var refresh_timer = null;

function showTooltip(x, y, contents) {
    $('<div id="tooltip">' + contents + '</div>').css( {
        position: 'absolute',
        display: 'none',
        top: y - 35,
        left: x + 10,
        border: '1px solid #fdd',
        padding: '2px',
        'background-color': '#fee',
        opacity: 0.80
        }).appendTo("body").fadeIn(200);
}

function init_slider() {
    $("#slider").slider({ min: MIN_WINDOW_SIZE / 1000
                        , max: MAX_WINDOW_SIZE / 1000
                        , value: (MIN_WINDOW_SIZE + (MAX_WINDOW_SIZE - window_size)) / 1000
                        , slide: function(event, ui) {
                                    window_size = MAX_WINDOW_SIZE - (1000 * ui.value - MIN_WINDOW_SIZE);
                                    adjust_frequency();
                                    display_timespan();
                                    if (refresh_timer != null) clearTimeout(refresh_timer);
                                    refresh_viewport();
                                 }
                        });
}

function adjust_frequency() {
    if (window_size > VERY_LOW_FREQUENCY_ABOVE) {
        refresh_frequency = VERY_LOW_REFRESH_FREQUENCY
    } else if (window_size > LOW_FREQUENCY_ABOVE) {
        refresh_frequency = LOW_REFRESH_FREQUENCY;
    } else if (window_size < HIGH_FREQUENCY_BELOW) {
        refresh_frequency = HIGH_REFRESH_FREQUENCY;
    } else {
        frequency_range = LOW_REFRESH_FREQUENCY - HIGH_REFRESH_FREQUENCY;
        window_size_range = LOW_FREQUENCY_ABOVE - HIGH_FREQUENCY_BELOW;
        dist = window_size - HIGH_FREQUENCY_BELOW;
        refresh_frequency = HIGH_REFRESH_FREQUENCY + frequency_range * (dist / window_size_range);
    }
}

function display_timespan() {
    if (window_size < 60 * 1000) {
        timespan = window_size / 1000 + " seconds";
    } else {
        minutes = window_size / (60 * 1000);
        rounded = Math.round(minutes);
        timespan = ""
        if (minutes != rounded) timespan += "about ";
        timespan += rounded + " minute";
        if (rounded >= 2) { timespan += "s"; }
    }
    $("#slider_value").text(timespan);
}

function init_hover() {
    $("#placeholder").bind("plothover", function (event, pos, item) {
        if (item) {
            if (previous_point != item.datapoint) {
                previous_point = item.datapoint;

                label = ""
                switch(item.seriesIndex) {
                    case 0:
                        label = transaction_info[item.dataIndex]
                        break;
                    case 1:
                        label = block_info[item.dataIndex]
                        break;
                }

                $("#tooltip").remove();
                showTooltip(item.pageX, item.pageY, label);
            }
        } else {
            $("#tooltip").remove();
            previous_point = null;
        }
    });
}

function plot_viewport(xmin, xmax) {
    yticks = [0];
    for (ytick = 1; ytick <= max_ytick; ytick *= 10) yticks.push([ytick, ytick + " BTC"]);

    if (xmax - xmin < 10 * 60 * 1000) {
        timefmt = "%h:%M:%S UTC"
    } else {
        timefmt = "%h:%M UTC"
    }

    optionpart = {
        xaxis: { mode: "time", timeformat: timefmt, min: xmin, max: xmax, ticks: 5 },
        yaxis: { transform: function (v) { return Math.log(v + 1); }, 
                 inverseTransform: function (v) { return Math.exp(v) - 1; },
                 ticks: yticks
               },
        points: { show: true, radius: 6, fill: 0.9 },
        grid: { hoverable: true },
        legend: { position: "nw", backgroundOpacity: 0 }
    };
    $.plot($("#placeholder"), datapart, optionpart);
}

function update_plot_data(additional_plot_data) {
    plot_data = plot_data.concat(additional_plot_data);
    max_ytick = 1;

    transaction_plot = [];
    transaction_info = [];
    block_plot = [];
    block_info = [];

    var updated_plot_data = []
    for (key in plot_data) {
        datapoint = plot_data[key];
        if (datapoint[0] >= oldest_timestamp_needed) {
            updated_plot_data.push(datapoint);
            if (datapoint[2] >= max_ytick) max_ytick *= 10;
            switch (datapoint[1]) {
                case "tx":
                    transaction_plot.push([datapoint[0], datapoint[2]]);
                    transaction_info.push(datapoint[3]);
                    break;
                case "block":
                    block_plot.push([datapoint[0], datapoint[2]]);
                    block_info.push(datapoint[3]);
                    break;
            }
        }
    }
    plot_data = updated_plot_data;

    datapart = [ { label: "transaction", data: transaction_plot, color: 1 }
               , { label: "block", data: block_plot, color: 0 }
               ];
}

function refresh_viewport() {
    now = (new Date()).getTime();
    plot_viewport(now - window_size, now);
    oldest_timestamp_needed = now - MAX_WINDOW_SIZE;
    refresh_timer = window.setTimeout("refresh_viewport()", refresh_frequency);
}

function toggle_status(is_connected) {
    if (is_connected && $("#status").css("display") != 'none')
        $("#status").hide();
    else if (!is_connected && $("#status").css("display") == 'none')
        $("#status").show();
}

function init_connection() {
    var rws = new ReconnectingWebSocket(DATASOURCE);
    rws.onopen = function() {
        toggle_status(true);
        rws.send(CMD_SUBSCRIBE_BLOCKS);
        rws.send(CMD_SUBSCRIBE_TX);
    };
    rws.onmessage = function(message_event) {
        var msg = JSON.parse(message_event.data);
        var needs_refreshing = false;
        if (msg["op"] === "utx") {
            var additional_plot_datapoint = [];
            var timestamp = msg["x"]["time"] * 1000;

            var total_value = 0;
            var components = [];
            for (out in msg["x"]["out"]) {
                value = msg["x"]["out"][out]["value"];
                value /= SATOSHIS_PER_BTC;
                total_value += value,
                components.push(value + " BTC");
            }

            additional_plot_datapoint[0] = timestamp;
            additional_plot_datapoint[1] = "tx";
            additional_plot_datapoint[2] = total_value;
            additional_plot_datapoint[3] =
                "Transfer of " + total_value + " BTC ("
                + components.join(" + ") + ")";
            update_plot_data([additional_plot_datapoint]);
            needs_refreshing = true;
        }
        if (msg["op"] === "block") {
            var additional_plot_datapoint = [];
            var timestamp = msg["x"]["time"] * 1000;

            var reward = msg["x"]["reward"];
            reward /= SATOSHIS_PER_BTC;

            additional_plot_datapoint[0] = timestamp;
            additional_plot_datapoint[1] = "block";
            additional_plot_datapoint[2] = reward;
            additional_plot_datapoint[3] =
                "New block found (" + reward + " BTC awarded)";
            update_plot_data([additional_plot_datapoint]);
            needs_refreshing = true;
        }

        if (needs_refreshing) {
            if (refresh_timer != null) clearTimeout(refresh_timer);
            refresh_viewport();
        }
    };
    rws.onerror = function (error) {
        toggle_status(false);
    }
}

$(document).ready(function () {
    init_hover();
    init_slider();
    refresh_viewport();
    init_connection();
});
