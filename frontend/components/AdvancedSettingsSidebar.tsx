import React from 'react';
import { AdvancedSettings } from '../types';

interface AdvancedSettingsSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    settings: AdvancedSettings;
    onSettingsChange: (newSettings: AdvancedSettings) => void;
}

const AdvancedSettingsSidebar: React.FC<AdvancedSettingsSidebarProps> = ({
    isOpen,
    onClose,
    settings,
    onSettingsChange
}) => {
    // 简单的辅助函数用于更新单个字段
    const update = (field: keyof AdvancedSettings, value: number) => {
        onSettingsChange({ ...settings, [field]: value });
    };

    return (
        <>
            {/* Backdrop (点击背景关闭) */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-30 z-40 transition-opacity"
                    onClick={onClose}
                />
            )}

            {/* Sidebar Panel */}
            <div className={`fixed top-0 right-0 h-full w-80 bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out overflow-y-auto ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

                {/* Header */}
                <div className="p-4 border-b flex justify-between items-center bg-indigo-50">
                    <h2 className="text-lg font-bold text-slate-800">Optimization Tuning</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-700 font-bold text-xl">&times;</button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-8">
                    <p className="text-sm text-slate-500 mb-4">
                        Adjust these weights to prioritize different goals in the scheduling algorithm.
                    </p>

                    {/* 1. Workload Balancing (lambda_param) */}
                    <div>
                        <div className="flex justify-between mb-1">
                            <label className="text-sm font-semibold text-slate-700">Workload Balance</label>
                            <span className="text-xs font-mono bg-slate-100 px-2 rounded text-indigo-600">{settings.lambda_param.toFixed(1)}</span>
                        </div>
                        <input
                            type="range"
                            min="0" max="5" step="0.1"
                            value={settings.lambda_param}
                            onChange={(e) => update('lambda_param', parseFloat(e.target.value))}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                        <p className="text-xs text-slate-500 mt-1">Higher = Try harder to make every day have even patient counts.</p>
                    </div>

                    {/* 2. Visit Frequency (lambda_facility) */}
                    <div>
                        <div className="flex justify-between mb-1">
                            <label className="text-sm font-semibold text-slate-700">Visit Consistency</label>
                            <span className="text-xs font-mono bg-slate-100 px-2 rounded text-indigo-600">{settings.lambda_facility.toFixed(1)}</span>
                        </div>
                        <input
                            type="range"
                            min="0" max="5" step="0.1"
                            value={settings.lambda_facility}
                            onChange={(e) => update('lambda_facility', parseFloat(e.target.value))}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                        <p className="text-xs text-slate-500 mt-1">Higher = Avoid long gaps between visits to the same facility.</p>
                    </div>

                    {/* 3. Anti-Bunching (lambda_bunching) */}
                    <div>
                        <div className="flex justify-between mb-1">
                            <label className="text-sm font-semibold text-slate-700">Spread Visits</label>
                            <span className="text-xs font-mono bg-slate-100 px-2 rounded text-indigo-600">{settings.lambda_bunching.toFixed(1)}</span>
                        </div>
                        <input
                            type="range"
                            min="0" max="5" step="0.1"
                            value={settings.lambda_bunching}
                            onChange={(e) => update('lambda_bunching', parseFloat(e.target.value))}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                        <p className="text-xs text-slate-500 mt-1">Higher = Penalize visiting the same facility twice in a short period.</p>
                    </div>

                    {/* 4. Service Buffer (alpha) */}
                    <div>
                        <div className="flex justify-between mb-1">
                            <label className="text-sm font-semibold text-slate-700">Census Buffer (Alpha)</label>
                            <span className="text-xs font-mono bg-slate-100 px-2 rounded text-indigo-600">{Math.round(settings.alpha * 100)}%</span>
                        </div>
                        <input
                            type="range"
                            min="0" max="0.2" step="0.01"
                            value={settings.alpha}
                            onChange={(e) => update('alpha', parseFloat(e.target.value))}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                        <p className="text-xs text-slate-500 mt-1">Percentage of extra capacity to reserve above actual census.</p>
                    </div>

                    {/* 5. Facility Visit Window (T) */}
                    <div>
                        <div className="flex justify-between mb-1">
                            <label className="text-sm font-semibold text-slate-700">Visit Gap Window (T)</label>
                            <span className="text-xs font-mono bg-slate-100 px-2 rounded text-indigo-600">
                                {settings.facility_visit_window} days
                            </span>
                        </div>
                        <input
                            type="range"
                            min="5" max="20" step="1" //5-20 days
                            value={settings.facility_visit_window}
                            onChange={(e) => update('facility_visit_window', parseInt(e.target.value))}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Target gap between visits (default 10 days). Higher = Less frequent visits required.
                        </p>
                    </div>

                    {/* Reset Button */}
                    <div className="pt-4 border-t">
                         <button
                            onClick={() => onSettingsChange({
                                lambda_param: 0,
                                lambda_facility: 0.1,
                                lambda_bunching: 0.1,
                                alpha: 0.05,
                                facility_visit_window: 10
                            })}
                            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                            Reset to Defaults
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};

export default AdvancedSettingsSidebar;