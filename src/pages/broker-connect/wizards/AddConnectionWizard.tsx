import React from 'react';

interface Props {
    onClose: () => void;
    onAdded: () => void;
}

const AddConnectionWizard: React.FC<Props> = ({ onClose }) => (
    <div onClick={onClose}>Wizard stub</div>
);

export default AddConnectionWizard;
