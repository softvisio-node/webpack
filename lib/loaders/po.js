export default async function ( buffer, map, meta ) {
    const callback = this.async(),
        options = this.getOptions();

    if ( this.cacheable ) this.cacheable();

    const locale = new options.PoFile( buffer ).toLocale().toJSON();

    delete locale.id;

    callback( null, `export default ${ JSON.stringify( locale ) }`, map, meta );
}
