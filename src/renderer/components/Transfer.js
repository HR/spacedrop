import React from 'react'
import { basename } from 'path'
import moment from 'moment'
import { classList } from '../lib/util'

const timeFormat = {
  sameDay: '[Today,] HH:mm',
  lastDay: '[Yesterday,] HH:mm',
  lastWeek: 'dddd [,] HH:mm',
  sameElse: 'dddd, D MMMM, YYYY HH:mm'
}


export default function Message (props) {
  let contentRender = null
  const {  } = props

  return (
    <div
      className=''
    >
      {showTimestamp && <div className='timestamp'>{friendlyTimestamp}</div>}

      <div className='bubble-container'>{contentRender}</div>
    </div>
  )
}
