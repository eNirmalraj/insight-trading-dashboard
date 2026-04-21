import React from 'react';
import type { IndicatorModel } from '../types';

interface Props {
    model: IndicatorModel;
    update: (patch: Partial<IndicatorModel>) => void;
}

const StepInfo: React.FC<Props> = ({ model, update }) => {
    const parseOptInt = (s: string): number | undefined => {
        if (s.trim() === '') return undefined;
        const n = parseInt(s, 10);
        return isNaN(n) ? undefined : n;
    };

    return (
        <div className="max-w-xl space-y-4">
            <h2 className="text-sm font-semibold text-white">Indicator Info</h2>
            <p className="text-xs text-gray-500">Name your indicator and choose how it renders on the chart.</p>

            <label className="block">
                <span className="text-[11px] text-gray-400">Name</span>
                <input type="text" value={model.info.name}
                    onChange={(e) => update({ info: { ...model.info, name: e.target.value } })}
                    className="mt-1 w-full bg-[#1e222d] border border-white/[0.08] rounded px-3 py-2 text-sm text-white outline-none focus:border-[#2962FF]" />
            </label>

            <label className="block">
                <span className="text-[11px] text-gray-400">Short Name (badge)</span>
                <input type="text" value={model.info.shortname} maxLength={8}
                    onChange={(e) => update({ info: { ...model.info, shortname: e.target.value } })}
                    className="mt-1 w-full bg-[#1e222d] border border-white/[0.08] rounded px-3 py-2 text-sm text-white outline-none focus:border-[#2962FF]" />
            </label>

            <label className="flex items-center gap-3">
                <input type="checkbox" checked={model.info.overlay}
                    onChange={(e) => update({ info: { ...model.info, overlay: e.target.checked } })} />
                <span className="text-xs text-gray-300">Overlay on price chart (uncheck for a separate pane)</span>
            </label>

            <div className="pt-3 border-t border-white/[0.05]">
                <p className="text-[11px] text-gray-400 mb-2">Drawing Caps (optional)</p>
                <p className="text-[10px] text-gray-600 mb-3 italic">
                    If this indicator draws lots of lines/labels (e.g. history levels), raise these so the chart keeps them on screen.
                </p>

                <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                        <span className="text-[11px] text-gray-400">Max Labels Count</span>
                        <input type="number" min={0} placeholder="(default)"
                            value={model.info.maxLabelsCount ?? ''}
                            onChange={(e) => update({ info: { ...model.info, maxLabelsCount: parseOptInt(e.target.value) } })}
                            className="mt-1 w-full bg-[#1e222d] border border-white/[0.08] rounded px-3 py-2 text-sm text-white outline-none focus:border-[#2962FF]" />
                    </label>

                    <label className="block">
                        <span className="text-[11px] text-gray-400">Max Lines Count</span>
                        <input type="number" min={0} placeholder="(default)"
                            value={model.info.maxLinesCount ?? ''}
                            onChange={(e) => update({ info: { ...model.info, maxLinesCount: parseOptInt(e.target.value) } })}
                            className="mt-1 w-full bg-[#1e222d] border border-white/[0.08] rounded px-3 py-2 text-sm text-white outline-none focus:border-[#2962FF]" />
                    </label>
                </div>
            </div>
        </div>
    );
};

export default StepInfo;
