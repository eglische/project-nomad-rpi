from pathlib import Path


OPENWEBRX_JS = Path("/usr/lib/python3/dist-packages/htdocs/openwebrx.js")
UI_JS = Path("/usr/lib/python3/dist-packages/htdocs/lib/UI.js")
DEMOD_PANEL_JS = Path("/usr/lib/python3/dist-packages/htdocs/lib/DemodulatorPanel.js")
CSS_FILE = Path("/usr/lib/python3/dist-packages/htdocs/css/openwebrx.css")
CONNECTION_PY = Path("/usr/lib/python3/dist-packages/owrx/connection.py")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Could not find patch anchor for {label}")
    return text.replace(old, new, 1)


openwebrx_js = OPENWEBRX_JS.read_text()
openwebrx_js = replace_once(
    openwebrx_js,
    "var wf_data = null;\nvar battery_shown = false;\n",
    "var wf_data = null;\nvar battery_shown = false;\nvar pending_center_frequency = null;\nvar pending_tuned_frequency = null;\nvar band_min_freq = null;\nvar band_max_freq = null;\nvar band_wrap = true;\n",
    "globals",
)
openwebrx_js = replace_once(
    openwebrx_js,
    """function jumpBySteps(steps) {
    steps = Math.round(steps);
    if (steps != 0) {
        var key = UI.getDemodulatorPanel().getMagicKey();
        var f = center_freq + steps * bandwidth / 4;
        ws.send(JSON.stringify({
            "type": "setfrequency", "params": { "frequency": f, "key": key }
        }));
        UI.toggleScanner(false);
    }
}
""",
    """function normalizeBandFrequency(freq) {
    if (band_min_freq === null || band_max_freq === null) return Math.round(freq);

    var target = Math.round(freq);
    if (target >= band_min_freq && target <= band_max_freq) return target;
    if (!band_wrap) return null;

    var band_width = (band_max_freq - band_min_freq) + 1;
    while (target < band_min_freq) target += band_width;
    while (target > band_max_freq) target -= band_width;
    return target;
}

function getDesiredCenterFrequency(freq) {
    if (!bandwidth) return Math.round(freq);
    if (band_min_freq === null || band_max_freq === null) return Math.round(freq);

    if ((band_max_freq - band_min_freq) <= bandwidth) {
        return Math.round((band_min_freq + band_max_freq) / 2);
    }

    var minCenter = band_min_freq + bandwidth / 2;
    var maxCenter = band_max_freq - bandwidth / 2;
    return Math.round(Math.max(minCenter, Math.min(maxCenter, freq)));
}

function retuneOutsideCurrentWindow(freq) {
    if (!bandwidth || !center_freq) return false;

    var normalized = normalizeBandFrequency(freq);
    if (normalized === null) return false;

    var key = UI.getDemodulatorPanel().getMagicKey();
    pending_tuned_frequency = normalized;
    pending_center_frequency = getDesiredCenterFrequency(normalized);

    ws.send(JSON.stringify({
        "type": "setfrequency", "params": { "frequency": pending_center_frequency, "key": key }
    }));
    UI.toggleScanner(false);
    return true;
}

function getBandWindowInfo() {
    if (!bandwidth || !center_freq) return null;

    var viewStart = Math.round(center_freq - bandwidth / 2);
    var viewEnd = Math.round(center_freq + bandwidth / 2);
    var bandStart = band_min_freq !== null ? band_min_freq : viewStart;
    var bandEnd = band_max_freq !== null ? band_max_freq : viewEnd;
    if (bandEnd <= bandStart) return null;

    var minCenter = bandStart + bandwidth / 2;
    var maxCenter = bandEnd - bandwidth / 2;
    var ratio = 0.5;
    if (maxCenter > minCenter) {
        ratio = (center_freq - minCenter) / (maxCenter - minCenter);
        ratio = Math.max(0, Math.min(1, ratio));
    }

    return {
        bandStart: Math.round(bandStart),
        bandEnd: Math.round(bandEnd),
        viewStart: viewStart,
        viewEnd: viewEnd,
        ratio: ratio
    };
}

function shiftBandWindow(steps) {
    if (!bandwidth || !center_freq) return false;
    steps = Math.round(steps);
    if (steps === 0) return false;

    var target = center_freq + steps * bandwidth * 0.8;
    var normalized = normalizeBandFrequency(target);
    if (normalized === null) return false;

    var key = UI.getDemodulatorPanel().getMagicKey();
    pending_center_frequency = getDesiredCenterFrequency(normalized);
    pending_tuned_frequency = UI.getFrequency();

    ws.send(JSON.stringify({
        "type": "setfrequency", "params": { "frequency": pending_center_frequency, "key": key }
    }));
    UI.toggleScanner(false);
    return true;
}

function setBandPosition(position) {
    if (band_min_freq === null || band_max_freq === null || !bandwidth) return false;

    var ratio = Math.max(0, Math.min(1, position));
    var minCenter = band_min_freq + bandwidth / 2;
    var maxCenter = band_max_freq - bandwidth / 2;
    var targetCenter = maxCenter <= minCenter
        ? Math.round((band_min_freq + band_max_freq) / 2)
        : Math.round(minCenter + ratio * (maxCenter - minCenter));

    var key = UI.getDemodulatorPanel().getMagicKey();
    pending_center_frequency = targetCenter;
    pending_tuned_frequency = null;

    ws.send(JSON.stringify({
        "type": "setfrequency", "params": { "frequency": pending_center_frequency, "key": key }
    }));
    UI.toggleScanner(false);
    return true;
}

function jumpBySteps(steps) {
    return shiftBandWindow(steps);
}
""",
    "replace jumpBySteps block",
)
openwebrx_js = replace_once(
    openwebrx_js,
    """                        if ('samp_rate' in config)
                            bandwidth = config['samp_rate'];
                        if ('center_freq' in config)
                            center_freq = config['center_freq'];
                        if ('fft_size' in config) {
""",
    """                        if ('samp_rate' in config)
                            bandwidth = config['samp_rate'];
                        if ('center_freq' in config)
                            center_freq = config['center_freq'];
                        if ('band_min_freq' in config)
                            band_min_freq = config['band_min_freq'];
                        if ('band_max_freq' in config)
                            band_max_freq = config['band_max_freq'];
                        if ('band_wrap' in config)
                            band_wrap = config['band_wrap'];
                        if ('fft_size' in config) {
""",
    "config band keys",
)
openwebrx_js = replace_once(
    openwebrx_js,
    """                        demodulatorPanel.setCenterFrequency(center_freq);
                        demodulatorPanel.setInitialParams(initial_demodulator_params);
""",
    """                        demodulatorPanel.setCenterFrequency(center_freq);
                        demodulatorPanel.setInitialParams(initial_demodulator_params);

                        if (pending_tuned_frequency !== null && Math.abs(pending_tuned_frequency - center_freq) <= bandwidth / 2) {
                            var target_frequency = pending_tuned_frequency;
                            pending_tuned_frequency = null;
                            pending_center_frequency = null;
                            setTimeout(function() {
                                UI.setFrequency(target_frequency, false);
                            }, 75);
                        }
""",
    "pending retune apply",
)
OPENWEBRX_JS.write_text(openwebrx_js)


ui_js = UI_JS.read_text()
ui_js = replace_once(
    ui_js,
    """UI.setFrequency = function(freq, snap = true) {
    // When in CW mode, offset by 800Hz
    var delta = this.getModulation() === 'cw'? this.getCwOffset() : 0;
    // Snap frequency to the tuning step
    if (snap) freq = Utils.snapFrequency(freq, tuning_step);
    // Tune to the frequency offset
    var demod = this.getDemodulator();
    return demod? demod.set_offset_frequency(freq - delta - center_freq) : false;
};
""",
    """UI.setFrequency = function(freq, snap = true) {
    // When in CW mode, offset by 800Hz
    var delta = this.getModulation() === 'cw'? this.getCwOffset() : 0;
    // Snap frequency to the tuning step
    if (snap) freq = Utils.snapFrequency(freq, tuning_step);

    if (typeof normalizeBandFrequency === 'function') {
        var normalized = normalizeBandFrequency(freq);
        if (normalized === null) return false;
        freq = normalized;
        if (snap) freq = Utils.snapFrequency(freq, tuning_step);
    }

    if (bandwidth && center_freq && Math.abs(freq - delta - center_freq) > bandwidth / 2) {
        if (typeof retuneOutsideCurrentWindow === 'function') {
            return retuneOutsideCurrentWindow(freq - delta);
        }
        return false;
    }

    // Tune to the frequency offset
    var demod = this.getDemodulator();
    return demod? demod.set_offset_frequency(freq - delta - center_freq) : false;
};
""",
    "UI.setFrequency",
)
UI_JS.write_text(ui_js)


demod_panel_js = DEMOD_PANEL_JS.read_text()
demod_panel_js = replace_once(
    demod_panel_js,
    """    displayEl.on('frequencychange', function(event, freq) {
        var demod = self.getDemodulator();
        var delta = demod.get_modulation() === 'cw'? UI.getCwOffset() : 0;
        demod.set_offset_frequency(freq - self.center_freq - delta);
    });
""",
    """    displayEl.on('frequencychange', function(event, freq) {
        UI.setFrequency(freq, false);
    });
""",
    "DemodulatorPanel frequencychange",
)
demod_panel_js = replace_once(
    demod_panel_js,
    """    el.on('change', '.openwebrx-squelch-slider', function() {
        self.updateSquelch();
    });
    window.addEventListener('hashchange', function() {
        self.onHashChange();
    });
};
""",
    """    el.on('change', '.openwebrx-squelch-slider', function() {
        self.updateSquelch();
    });
    el.on('click', '.openwebrx-band-shift', function() {
        var direction = parseInt($(this).data('direction'), 10);
        if (!isNaN(direction) && typeof shiftBandWindow === 'function') {
            shiftBandWindow(direction);
        }
    });
    el.on('input change', '.openwebrx-band-slider', function() {
        if (typeof setBandPosition === 'function') {
            setBandPosition(parseInt($(this).val(), 10) / 1000);
        }
    });
    window.addEventListener('hashchange', function() {
        self.onHashChange();
    });
};
""",
    "band nav events",
)
demod_panel_js = replace_once(
    demod_panel_js,
    """    html.push($(
        '<div class="openwebrx-panel-line openwebrx-panel-flex-line">' +
            '<div class="openwebrx-button openwebrx-demodulator-button openwebrx-button-dig">DIG</div>' +
            '<select class="openwebrx-secondary-demod-listbox">' +
                '<option value="none"></option>' +
                digiModes.map(function(m){
                    return '<option value="' + m.modulation + '">' + m.name + '</option>';
                }).join('') +
            '</select>' +
        '</div>'
    ));

    this.el.find(".openwebrx-modes").html(html);
};
""",
    """    html.push($(
        '<div class="openwebrx-panel-line openwebrx-panel-flex-line">' +
            '<div class="openwebrx-button openwebrx-demodulator-button openwebrx-button-dig">DIG</div>' +
            '<select class="openwebrx-secondary-demod-listbox">' +
                '<option value="none"></option>' +
                digiModes.map(function(m){
                    return '<option value="' + m.modulation + '">' + m.name + '</option>';
                }).join('') +
            '</select>' +
        '</div>'
    ));

    html.push($(
        '<div class="openwebrx-panel-line openwebrx-band-nav">' +
            '<div class="openwebrx-band-nav-header">' +
                '<span class="openwebrx-band-label">Band navigator</span>' +
                '<span class="openwebrx-band-range-label"></span>' +
            '</div>' +
            '<div class="openwebrx-band-nav-controls">' +
                '<button type="button" class="openwebrx-button openwebrx-band-shift" data-direction="-1">&lsaquo;</button>' +
                '<input type="range" class="openwebrx-band-slider" min="0" max="1000" step="1" value="500">' +
                '<button type="button" class="openwebrx-button openwebrx-band-shift" data-direction="1">&rsaquo;</button>' +
            '</div>' +
            '<div class="openwebrx-band-window-label"></div>' +
        '</div>'
    ));

    this.el.find(".openwebrx-modes").html(html);
    this.updateBandNavigator();
};
""",
    "render band nav",
)
demod_panel_js = replace_once(
    demod_panel_js,
    """DemodulatorPanel.prototype.setCenterFrequency = function(center_freq) {
    var me = this;
    if (me.centerFreqTimeout) {
        clearTimeout(me.centerFreqTimeout);
        me.centerFreqTimeout = false;
    }
    this.centerFreqTimeout = setTimeout(function() {
        me.stopDemodulator();
        me.center_freq = center_freq;
        me.startDemodulator();
        me.centerFreqTimeout = false;
    }, 50);
};
""",
    """DemodulatorPanel.prototype.setCenterFrequency = function(center_freq) {
    var me = this;
    if (me.centerFreqTimeout) {
        clearTimeout(me.centerFreqTimeout);
        me.centerFreqTimeout = false;
    }
    this.centerFreqTimeout = setTimeout(function() {
        me.stopDemodulator();
        me.center_freq = center_freq;
        me.startDemodulator();
        me.updateBandNavigator();
        me.centerFreqTimeout = false;
    }, 50);
};
""",
    "setCenterFrequency update navigator",
)
demod_panel_js = replace_once(
    demod_panel_js,
    """DemodulatorPanel.prototype.parseHash = function() {
""",
    """DemodulatorPanel.prototype.updateBandNavigator = function() {
    var info = typeof getBandWindowInfo === 'function' ? getBandWindowInfo() : null;
    var $nav = this.el.find('.openwebrx-band-nav');
    if (!$nav.length) return;

    if (!info) {
        $nav.hide();
        return;
    }

    var display = this.tuneableFrequencyDisplay;
    var formatFrequency = function(freq) {
        var exponent = 0;
        if (freq !== 0 && !Number.isNaN(freq)) {
            exponent = Math.floor(Math.log10(Math.abs(freq)) / 3) * 3;
        }
        var digits = Math.max(0, exponent - (display.precision || 2));
        var formatted = (freq / Math.pow(10, exponent)).toLocaleString(undefined, {
            maximumFractionDigits: digits,
            minimumFractionDigits: digits
        });
        var suffixMap = {'0':'', '3':'k', '6':'M', '9':'G', '12':'T'};
        return formatted + ' ' + (suffixMap[String(exponent)] || '') + 'Hz';
    };

    $nav.show();
    $nav.find('.openwebrx-band-slider').val(Math.round(info.ratio * 1000));
    $nav.find('.openwebrx-band-range-label').text(formatFrequency(info.bandStart) + ' – ' + formatFrequency(info.bandEnd));
    $nav.find('.openwebrx-band-window-label').text('Visible: ' + formatFrequency(info.viewStart) + ' – ' + formatFrequency(info.viewEnd));
};

DemodulatorPanel.prototype.parseHash = function() {
""",
    "insert updateBandNavigator",
)
DEMOD_PANEL_JS.write_text(demod_panel_js)


css_text = CSS_FILE.read_text()
css_text = replace_once(
    css_text,
    """#openwebrx-smeter {
""",
    """.openwebrx-band-nav {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.openwebrx-band-nav-header,
.openwebrx-band-window-label {
    font-size: 9px;
    line-height: 1.35;
    color: #c9c9c9;
}

.openwebrx-band-nav-header {
    display: flex;
    justify-content: space-between;
    gap: 6px;
}

.openwebrx-band-label {
    font-weight: 600;
    color: #f0f0f0;
}

.openwebrx-band-nav-controls {
    display: flex;
    align-items: center;
    gap: 6px;
}

.openwebrx-band-slider {
    flex: 1 1 auto;
    width: 100%;
}

.openwebrx-band-shift {
    width: 24px;
    min-width: 24px;
    text-align: center;
    padding: 0;
}

#openwebrx-smeter {
""",
    "insert band nav css",
)
CSS_FILE.write_text(css_text)


connection_py = CONNECTION_PY.read_text()
connection_py = replace_once(
    connection_py,
    """        "tuning_step",
        "initial_squelch_level",
""",
    """        "tuning_step",
        "band_min_freq",
        "band_max_freq",
        "band_wrap",
        "initial_squelch_level",
""",
    "sdr config keys",
)
CONNECTION_PY.write_text(connection_py)
