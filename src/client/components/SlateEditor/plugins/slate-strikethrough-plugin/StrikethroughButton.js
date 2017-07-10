import React from 'react';
import Types from 'prop-types';
import classnames from 'classnames';

import { hasMark, strikethroughMark } from './StrikethroughUtils';
import { OverlayTrigger, Tooltip } from 'react-bootstrap';

const StrikethroughButton = ({ state, onChange }) => (
  <OverlayTrigger placement="bottom" overlay={<Tooltip id="bold-tp">Strikethrough (Ctrl+S)</Tooltip>}>
    <button className={classnames({ 'btn btn-default': true, active: hasMark(state) })}
      onClick={e => onChange(strikethroughMark(state))}
    >
      <i className="fa fa-strikethrough"/>
    </button>
  </OverlayTrigger>
);

StrikethroughButton.propTypes = {
  state: Types.object,
  onChange: Types.func
};

export default StrikethroughButton;