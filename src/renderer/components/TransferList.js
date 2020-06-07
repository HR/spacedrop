import React, { useEffect, useState, useRef } from 'react'
import { classList } from '../lib/util'

export default function TransferList (props) {
  const endRef = useRef(null)

  // Scrolls to the bottom
  function scrollToBottom () {
    endRef.current.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }

  // Scroll to the bottom
  // useEffect(scrollToBottom)

  return (
    <div className=''>
      {!!props.transfers &&
        props.transfers.map(transfer => (
          <Transfer id={transfer.id} key={transfer.id} name={transfer.name} />
        ))}
    </div>
}
