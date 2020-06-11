import React, { useEffect, useState, useRef } from 'react'
import { Tabs, Tab } from 'react-bootstrap'
import { classList } from '../lib/util'
import Drop from './Drop'

export default function Wormholes (props) {
  const endRef = useRef(null)

  // Scrolls to the bottom
  function scrollToBottom () {
    endRef.current.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }

  // Scroll to the bottom
  // useEffect(scrollToBottom)

  const { wormholes } = props

  return (
    <div className='wormholes'>
      {wormholes.length ? (
        <Tabs
          activeKey={props.active}
          onSelect={props.setActive}
          variant='pills'
        >
          {wormholes.map(hole => (
            <Tab
              key={hole.id}
              eventKey={hole.id}
              title={
                <React.Fragment>
                  {hole.name}
                  <div className={classList({ online: hole.online })}></div>
                </React.Fragment>
              }
            >
              {hole.drops.map(drop => (
                <Drop key={drop.name} {...drop} />
              ))}
            </Tab>
          ))}
        </Tabs>
      ) : (
        <div className='noholes'>
          <img src='../../../static/spacedrop.svg' />
          <br />
          Create a new wormhole to drop files
        </div>
      )}
    </div>
  )
}
